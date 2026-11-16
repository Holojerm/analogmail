// Sealing, recalling and what the sender may see afterwards. Sealing fixes
// the pickup, the postmark and both dates; nothing here ever reads when a
// letter was delivered or opened.

import { and, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { planPosting, senderView, type Posting } from '#layers/post/shared/utils/postmark'

import type { DeskLetter, SentStatus } from '../../shared/utils/letter-doc'
import { otherMembers } from './drafts'
import { correspondenceLabels } from './correspondences'
import type { LettersDb } from './people'
import { recipientIdentity } from './recipients'

export type PostingRefusal = 'closed' | 'sender-needs-city' | 'recipient-not-ready'

export interface SealRecipient {
  id: string
  name: string
  /** SPKI, base64url: the key this reader's copy of the letter's key is wrapped to. */
  publicKey: string
  /** Each reader's copy travels to their own city and arrives on their own mail day. */
  posting: Posting
}

export interface SealPlan {
  /** One for a pair or a kept mantel; every other member for a family. */
  recipients: SealRecipient[]
  /** The first, or only, reader. Kept beside `recipients` for the common case. */
  recipientId: string
  recipientName: string
  recipientPublicKey: string
  /** A kept mantel rather than a person: its letters may be sealed until a date. */
  toMantel: boolean
  /** The family's name when the letter goes to a family. */
  family: string | null
  /** The sender's own time zone: pickup is 5 pm there, whatever the device says. */
  senderZone: string
  /** Pickup and postmark, which are the sender's and so the same for every reader. */
  posting: Posting
  /** The day the last reader's copy arrives. */
  lastArrival: string
}

/**
 * What sealing a letter in this correspondence would mean right now: who
 * reads it, the keys to wrap its key to, and when it would be collected and
 * arrive. Also what sealing itself runs on.
 */
export async function planSeal(
  db: LettersDb,
  authorId: string,
  correspondenceId: string,
  now: Date,
): Promise<SealPlan | PostingRefusal> {
  const { postalProfiles, families } = tables
  const others = await otherMembers(db, correspondenceId, authorId)
  if (!others || others.length === 0) return 'closed'

  const profiles = await db
    .select()
    .from(postalProfiles)
    .where(inArray(postalProfiles.userId, [authorId, ...others]))
  const sender = profiles.find((profile) => profile.userId === authorId)
  if (!sender) return 'sender-needs-city'

  const recipients: SealRecipient[] = []
  let toMantel = false
  for (const id of others) {
    const place = profiles.find((profile) => profile.userId === id)
    const identity = await recipientIdentity(db, id)
    // Someone who has not finished setting up gets nothing yet; the rest do.
    if (!place || !identity) continue
    toMantel ||= identity.mantel
    recipients.push({
      id,
      name: identity.name,
      publicKey: identity.publicKey,
      posting: planPosting(
        now,
        { zone: sender.timeZone, place: sender },
        { place, mailDays: place.mailDays },
      ),
    })
  }
  const first = recipients[0]
  if (!first) return 'recipient-not-ready'

  const [family] = await db
    .select({ name: families.name })
    .from(families)
    .where(eq(families.correspondenceId, correspondenceId))
    .limit(1)
  return {
    recipients,
    recipientId: first.id,
    recipientName: first.name,
    recipientPublicKey: first.publicKey,
    toMantel,
    family: family?.name ?? null,
    senderZone: sender.timeZone,
    posting: first.posting,
    lastArrival: recipients
      .map((r) => r.posting.promisedDate)
      .toSorted()
      .at(-1)!,
  }
}

export type SealResult =
  | { status: 'sealed'; posting: { pickupAt: Date; postmark: string; promisedDate: string } }
  | {
      status:
        | 'not-yours'
        | 'already-sealed'
        | 'cannot-seal-until'
        | 'readers-changed'
        | PostingRefusal
    }

/** How far ahead a letter may be sealed. A child born today is not yet this old. */
export const OPENS_ON_MAX_YEARS = 100

/**
 * Seals a draft: every reader gets their copy of the key and a delivery with
 * its dates fixed. One transaction, and a second seal of the same letter
 * changes nothing.
 *
 * `wrappedKeys` is the letter's key wrapped once per reader, by reader id. A
 * single string is accepted when there is exactly one reader. If the readers
 * are no longer the ones the browser wrapped for, nothing is sealed.
 */
export async function sealLetter(
  db: LettersDb,
  authorId: string,
  letterId: string,
  wrappedKeys: string | Record<string, string>,
  now: Date,
  /** 'YYYY-MM-DD'. Only a letter to a kept mantel can be sealed until a day. */
  opensOn: string | null = null,
): Promise<SealResult> {
  const { letters, letterKeys, deliveries } = tables
  const [letter] = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1)
  if (!letter || letter.authorId !== authorId) return { status: 'not-yours' }
  if (letter.sealedAt) return { status: 'already-sealed' }

  const plan = await planSeal(db, authorId, letter.correspondenceId, now)
  if (typeof plan === 'string') return { status: plan }
  const { posting, recipients } = plan
  const keys = typeof wrappedKeys === 'string' ? { [plan.recipientId]: wrappedKeys } : wrappedKeys
  if (
    Object.keys(keys).length !== recipients.length ||
    recipients.some((reader) => !keys[reader.id])
  ) {
    return { status: 'readers-changed' }
  }
  if (opensOn) {
    const latest = `${Number(posting.postmark.slice(0, 4)) + OPENS_ON_MAX_YEARS}${posting.postmark.slice(4)}`
    if (!plan.toMantel || opensOn <= posting.postmark || opensOn > latest) {
      return { status: 'cannot-seal-until' }
    }
  }

  await db.batch([
    db
      .update(letters)
      .set({
        sealedAt: now,
        pickupAt: posting.at,
        postmarkDate: posting.postmark,
        opensOn,
        updatedAt: now,
      })
      .where(and(eq(letters.id, letterId), isNull(letters.sealedAt))),
    db
      .insert(letterKeys)
      .values(
        recipients.map((reader) => ({
          letterId,
          userId: reader.id,
          wrappedKey: keys[reader.id]!,
          createdAt: now,
        })),
      )
      .onConflictDoNothing(),
    db
      .insert(deliveries)
      .values(
        recipients.map((reader) => ({
          letterId,
          recipientId: reader.id,
          kind: 'letter',
          earliestDate: reader.posting.earliestDate,
          promisedDate: reader.posting.promisedDate,
          transitDays: reader.posting.transitDays,
          createdAt: now,
        })),
      )
      .onConflictDoNothing(),
  ])
  return {
    status: 'sealed',
    posting: {
      pickupAt: posting.at,
      postmark: posting.postmark,
      promisedDate: plan.lastArrival,
    },
  }
}

export type RecallResult = 'recalled' | 'too-late' | 'not-sealed' | 'not-yours'

/**
 * Takes a sealed letter back before it is collected. It becomes a draft
 * again: the recipient's key and the delivery are deleted. After pickup the
 * letter is final.
 */
export async function recallLetter(
  db: LettersDb,
  authorId: string,
  letterId: string,
  now: Date,
): Promise<RecallResult> {
  const { letters, letterKeys, deliveries } = tables
  const [letter] = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1)
  if (!letter || letter.authorId !== authorId) return 'not-yours'
  if (!letter.sealedAt || !letter.pickupAt) return 'not-sealed'
  if (now.getTime() >= letter.pickupAt.getTime()) return 'too-late'

  const stillWaiting = and(eq(letters.id, letterId), gt(letters.pickupAt, now))
  const claimed = await db
    .update(letters)
    .set({ sealedAt: null, pickupAt: null, postmarkDate: null, opensOn: null, updatedAt: now })
    .where(stillWaiting)
    .returning({ id: letters.id })
  if (claimed.length === 0) return 'too-late'
  await db.batch([
    db
      .delete(deliveries)
      .where(and(eq(deliveries.letterId, letterId), eq(deliveries.state, 'in_transit'))),
    db
      .delete(letterKeys)
      .where(and(eq(letterKeys.letterId, letterId), ne(letterKeys.userId, authorId))),
  ])
  return 'recalled'
}

const iso = (date: Date) => date.toISOString()

/**
 * The writer's desk: their drafts and what they have sealed, newest first.
 * A sealed letter's status comes from `senderView`, which knows only the
 * dates fixed at the postmark and the clock. A letter to several readers is
 * in transit until the last copy's promised day.
 */
export async function listDesk(
  db: LettersDb,
  authorId: string,
  now: Date,
): Promise<{ zone: string; letters: DeskLetter[] }> {
  const { letters, deliveries, postalProfiles } = tables
  const [profile] = await db
    .select({ timeZone: postalProfiles.timeZone })
    .from(postalProfiles)
    .where(eq(postalProfiles.userId, authorId))
    .limit(1)
  const rows = await db
    .select({
      id: letters.id,
      correspondenceId: letters.correspondenceId,
      updatedAt: letters.updatedAt,
      sealedAt: letters.sealedAt,
      pickupAt: letters.pickupAt,
      postmark: letters.postmarkDate,
      opensOn: letters.opensOn,
    })
    .from(letters)
    .where(eq(letters.authorId, authorId))
    .orderBy(desc(letters.updatedAt))

  const labels = await correspondenceLabels(db, authorId, [
    ...new Set(rows.map((row) => row.correspondenceId)),
  ])
  // Only the dates fixed at the postmark are read here, never what became of a copy.
  const lastArrival = new Map<string, string>()
  const sealed = rows.filter((row) => row.sealedAt).map((row) => row.id)
  for (let i = 0; i < sealed.length; i += 80) {
    const copies = await db
      .select({ letterId: deliveries.letterId, promisedDate: deliveries.promisedDate })
      .from(deliveries)
      .where(
        and(inArray(deliveries.letterId, sealed.slice(i, i + 80)), eq(deliveries.kind, 'letter')),
      )
    for (const copy of copies) {
      const known = lastArrival.get(copy.letterId)
      if (!known || copy.promisedDate > known) lastArrival.set(copy.letterId, copy.promisedDate)
    }
  }

  const zone = profile?.timeZone ?? 'UTC'
  const mapped = rows.map((row) => {
    let status: SentStatus = { kind: 'draft' }
    const promisedDate = lastArrival.get(row.id)
    if (row.sealedAt && row.pickupAt && row.postmark && promisedDate) {
      const view = senderView(now, zone, {
        pickupAt: row.pickupAt,
        postmark: row.postmark,
        promisedDate,
      })
      status =
        view.kind === 'awaiting_pickup'
          ? { kind: view.kind, pickupAt: iso(view.pickupAt), arrives: view.arrives }
          : view
    }
    return {
      id: row.id,
      correspondenceId: row.correspondenceId,
      to: labels.get(row.correspondenceId)?.name ?? '',
      updatedAt: iso(row.updatedAt),
      status,
      opensOn: row.sealedAt ? row.opensOn : null,
    }
  })
  return { zone, letters: mapped }
}
