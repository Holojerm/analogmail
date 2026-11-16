// Sealing, recalling and what the sender may see afterwards. Sealing fixes
// the pickup, the postmark and both dates; nothing here ever reads when a
// letter was delivered or opened.

import { and, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { planPosting, senderView, type Posting } from '#layers/post/shared/utils/postmark'

import type { DeskLetter, SentStatus } from '../../shared/utils/letter-doc'
import { correspondentOf } from './drafts'
import { getDisplayName, type LettersDb } from './people'

export type PostingRefusal = 'closed' | 'sender-needs-city' | 'recipient-not-ready'

export interface SealPlan {
  recipientId: string
  recipientName: string
  recipientPublicKey: string
  /** The sender's own time zone: pickup is 5 pm there, whatever the device says. */
  senderZone: string
  posting: Posting
}

/**
 * What sealing a letter in this correspondence would mean right now: who
 * reads it, the key to wrap its key to, and when it would be collected and
 * arrive. Also what sealing itself runs on.
 */
export async function planSeal(
  db: LettersDb,
  authorId: string,
  correspondenceId: string,
  now: Date,
): Promise<SealPlan | PostingRefusal> {
  const { postalProfiles, userKeys, users } = tables
  const recipientId = await correspondentOf(db, correspondenceId, authorId)
  if (!recipientId) return 'closed'

  const profiles = await db
    .select()
    .from(postalProfiles)
    .where(inArray(postalProfiles.userId, [authorId, recipientId]))
  const sender = profiles.find((profile) => profile.userId === authorId)
  const recipient = profiles.find((profile) => profile.userId === recipientId)
  if (!sender) return 'sender-needs-city'
  const [key] = await db
    .select({ publicKey: userKeys.publicKey })
    .from(userKeys)
    .where(eq(userKeys.userId, recipientId))
    .limit(1)
  if (!recipient || !key) return 'recipient-not-ready'

  const [account] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, recipientId))
    .limit(1)
  return {
    recipientId,
    recipientName: (await getDisplayName(db, recipientId)) ?? account?.name ?? '',
    recipientPublicKey: key.publicKey,
    senderZone: sender.timeZone,
    posting: planPosting(
      now,
      { zone: sender.timeZone, place: sender },
      { place: recipient, mailDays: recipient.mailDays },
    ),
  }
}

export type SealResult =
  | { status: 'sealed'; posting: { pickupAt: Date; postmark: string; promisedDate: string } }
  | { status: 'not-yours' | 'already-sealed' | PostingRefusal }

/**
 * Seals a draft: the recipient gets their copy of the key and a delivery with
 * its dates fixed. One transaction, and a second seal of the same letter
 * changes nothing.
 */
export async function sealLetter(
  db: LettersDb,
  authorId: string,
  letterId: string,
  recipientWrappedKey: string,
  now: Date,
): Promise<SealResult> {
  const { letters, letterKeys, deliveries } = tables
  const [letter] = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1)
  if (!letter || letter.authorId !== authorId) return { status: 'not-yours' }
  if (letter.sealedAt) return { status: 'already-sealed' }

  const plan = await planSeal(db, authorId, letter.correspondenceId, now)
  if (typeof plan === 'string') return { status: plan }
  const { posting, recipientId } = plan

  await db.batch([
    db
      .update(letters)
      .set({ sealedAt: now, pickupAt: posting.at, postmarkDate: posting.postmark, updatedAt: now })
      .where(and(eq(letters.id, letterId), isNull(letters.sealedAt))),
    db
      .insert(letterKeys)
      .values({ letterId, userId: recipientId, wrappedKey: recipientWrappedKey, createdAt: now })
      .onConflictDoNothing(),
    db
      .insert(deliveries)
      .values({
        letterId,
        recipientId,
        kind: 'letter',
        earliestDate: posting.earliestDate,
        promisedDate: posting.promisedDate,
        transitDays: posting.transitDays,
        createdAt: now,
      })
      .onConflictDoNothing(),
  ])
  return {
    status: 'sealed',
    posting: {
      pickupAt: posting.at,
      postmark: posting.postmark,
      promisedDate: posting.promisedDate,
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
    .set({ sealedAt: null, pickupAt: null, postmarkDate: null, updatedAt: now })
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
 * dates fixed at the postmark and the clock.
 */
export async function listDesk(
  db: LettersDb,
  authorId: string,
  now: Date,
): Promise<{ zone: string; letters: DeskLetter[] }> {
  const {
    letters,
    deliveries,
    correspondenceMembers: members,
    people,
    users,
    postalProfiles,
  } = tables
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
      promisedDate: deliveries.promisedDate,
      chosen: people.displayName,
      account: users.name,
    })
    .from(letters)
    .innerJoin(
      members,
      and(eq(members.correspondenceId, letters.correspondenceId), ne(members.userId, authorId)),
    )
    .innerJoin(users, eq(users.id, members.userId))
    .leftJoin(people, eq(people.userId, members.userId))
    .leftJoin(deliveries, and(eq(deliveries.letterId, letters.id), eq(deliveries.kind, 'letter')))
    .where(eq(letters.authorId, authorId))
    .orderBy(desc(letters.updatedAt))

  const zone = profile?.timeZone ?? 'UTC'
  const mapped = rows.map((row) => {
    let status: SentStatus = { kind: 'draft' }
    if (row.sealedAt && row.pickupAt && row.postmark && row.promisedDate) {
      const view = senderView(now, zone, {
        pickupAt: row.pickupAt,
        postmark: row.postmark,
        promisedDate: row.promisedDate,
      })
      status =
        view.kind === 'awaiting_pickup'
          ? { kind: view.kind, pickupAt: iso(view.pickupAt), arrives: view.arrives }
          : view
    }
    return {
      id: row.id,
      correspondenceId: row.correspondenceId,
      to: row.chosen ?? row.account,
      updatedAt: iso(row.updatedAt),
      status,
    }
  })
  return { zone, letters: mapped }
}
