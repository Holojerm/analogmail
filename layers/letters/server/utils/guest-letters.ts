// Guest letters. A couple's anniversary mantel can have a write link, printed
// on a card. Whoever holds it can send one sealed letter after another to the
// mantel with no account: the letter is encrypted in their browser to the
// mantel's public key, so this code handles ciphertext and never a name.
//
// A guest has no city, so the letter has no transit: it arrives on the
// mantel's next mail day, sealed until the link's opening day. The link is on
// paper anyone can photograph, hence the closing day, the cap and the way to
// replace it.

import { and, count, desc, eq, isNull } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import * as tables from '@nuxthub/db/schema'

import { isKeeper } from '#layers/keys/server/utils/mantels'
import { base64url } from '#server/utils/hash'

import { GUEST_LETTERS_MAX, type GuestLinkView } from '../../shared/utils/guest'
import { mantelToday } from './kept-mantel'
import type { LettersDb } from './people'
import { OPENS_ON_MAX_YEARS } from './posting'

async function activeLink(db: LettersDb, mantelId: string) {
  const { guestLinks } = tables
  const [link] = await db
    .select()
    .from(guestLinks)
    .where(and(eq(guestLinks.mantelId, mantelId), isNull(guestLinks.revokedAt)))
    .orderBy(desc(guestLinks.createdAt))
    .limit(1)
  return link ?? null
}

const lettersFrom = async (db: LettersDb, linkId: string) => {
  const { letters } = tables
  const [row] = await db
    .select({ total: count() })
    .from(letters)
    .where(eq(letters.guestLinkId, linkId))
  return row?.total ?? 0
}

export type CreateGuestLinkResult =
  | { status: 'created'; id: string }
  | { status: 'not-keeper' | 'not-anniversary' | 'needs-post' | 'bad-dates' }

/**
 * Makes a mantel's write link, replacing the one it had. Letters already
 * sent through the old link stay; the old address stops working.
 */
export async function createGuestLink(
  db: LettersDb,
  keeperId: string,
  input: { mantelId: string; opensOn: string; closesOn: string },
  now: Date,
): Promise<CreateGuestLinkResult> {
  const { guestLinks, mantels, postalProfiles, correspondences, correspondenceMembers } = tables
  if (!(await isKeeper(db, keeperId, input.mantelId))) return { status: 'not-keeper' }
  const [mantel] = await db
    .select({ kind: mantels.kind, closedAt: mantels.closedAt })
    .from(mantels)
    .where(eq(mantels.id, input.mantelId))
    .limit(1)
  if (!mantel || mantel.closedAt || mantel.kind !== 'anniversary') {
    return { status: 'not-anniversary' }
  }
  const [post] = await db
    .select({ userId: postalProfiles.userId })
    .from(postalProfiles)
    .where(eq(postalProfiles.userId, input.mantelId))
    .limit(1)
  if (!post) return { status: 'needs-post' }

  const today = await mantelToday(db, input.mantelId, now)
  const latest = `${Number(today.slice(0, 4)) + OPENS_ON_MAX_YEARS}${today.slice(4)}`
  if (input.closesOn < today || input.opensOn <= input.closesOn || input.opensOn > latest) {
    return { status: 'bad-dates' }
  }

  const previous = await activeLink(db, input.mantelId)
  const correspondenceId = previous?.correspondenceId ?? crypto.randomUUID()
  const id = base64url(crypto.getRandomValues(new Uint8Array(16)))
  const statements: BatchItem<'sqlite'>[] = previous
    ? [
        db
          .update(guestLinks)
          .set({ revokedAt: now, updatedAt: now })
          .where(and(eq(guestLinks.mantelId, input.mantelId), isNull(guestLinks.revokedAt))),
      ]
    : [
        db
          .insert(correspondences)
          .values({ id: correspondenceId, mantelId: input.mantelId, createdAt: now }),
        db
          .insert(correspondenceMembers)
          .values({ correspondenceId, userId: input.mantelId, createdAt: now }),
      ]
  statements.push(
    db.insert(guestLinks).values({
      id,
      mantelId: input.mantelId,
      correspondenceId,
      opensOn: input.opensOn,
      closesOn: input.closesOn,
      maxLetters: GUEST_LETTERS_MAX,
      createdBy: keeperId,
      createdAt: now,
    }),
  )
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return { status: 'created', id }
}

/** A mantel's write link as its keepers see it. */
export async function guestLinkFor(db: LettersDb, keeperId: string, mantelId: string) {
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const link = await activeLink(db, mantelId)
  if (!link) return null
  return {
    id: link.id,
    opensOn: link.opensOn,
    closesOn: link.closesOn,
    letters: await lettersFrom(db, link.id),
    maxLetters: link.maxLetters,
  }
}

async function openLink(db: LettersDb, linkId: string, now: Date) {
  const { guestLinks, mantels } = tables
  const [row] = await db
    .select({ link: guestLinks, mantel: mantels })
    .from(guestLinks)
    .innerJoin(mantels, eq(mantels.id, guestLinks.mantelId))
    .where(eq(guestLinks.id, linkId))
    .limit(1)
  if (!row) return 'unknown' as const
  const { link, mantel } = row
  if (link.revokedAt || mantel.closedAt) return 'closed' as const
  if ((await mantelToday(db, link.mantelId, now)) > link.closesOn) return 'closed' as const
  if ((await lettersFrom(db, link.id)) >= link.maxLetters) return 'closed' as const
  return { link, mantel }
}

/** What the write page is told: enough to check the key and say when it opens. */
export async function viewGuestLink(
  db: LettersDb,
  linkId: string,
  now: Date,
): Promise<GuestLinkView> {
  const open = await openLink(db, linkId, now)
  if (typeof open === 'string') return { status: open }
  return {
    status: 'open',
    mantelId: open.mantel.id,
    mantelName: open.mantel.name,
    publicKey: open.mantel.publicKey,
    opensOn: open.link.opensOn,
    closesOn: open.link.closesOn,
  }
}

export type PostGuestLetterResult =
  | { status: 'posted'; opensOn: string }
  | { status: 'unknown' | 'closed' | 'exists' }

/**
 * Takes a guest's letter: ciphertext and its key wrapped to the mantel. It is
 * final at once (there is nobody to recall it), sealed until the link's
 * opening day, and due on the mantel's next mail day.
 */
export async function postGuestLetter(
  db: LettersDb,
  linkId: string,
  letter: { id: string; ciphertext: string; wrappedKey: string },
  now: Date,
): Promise<PostGuestLetterResult> {
  const { letters, letterKeys, deliveries } = tables
  const open = await openLink(db, linkId, now)
  if (typeof open === 'string') return { status: open }
  const { link } = open
  const [taken] = await db
    .select({ id: letters.id })
    .from(letters)
    .where(eq(letters.id, letter.id))
    .limit(1)
  if (taken) return { status: 'exists' }

  const today = await mantelToday(db, link.mantelId, now)
  await db.batch([
    db.insert(letters).values({
      id: letter.id,
      correspondenceId: link.correspondenceId,
      authorId: null,
      origin: 'guest',
      guestLinkId: link.id,
      sealedAt: now,
      pickupAt: now,
      postmarkDate: today,
      opensOn: link.opensOn,
      ciphertext: letter.ciphertext,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(letterKeys).values({
      letterId: letter.id,
      userId: link.mantelId,
      wrappedKey: letter.wrappedKey,
      createdAt: now,
    }),
    db.insert(deliveries).values({
      letterId: letter.id,
      recipientId: link.mantelId,
      kind: 'letter',
      earliestDate: today,
      promisedDate: today,
      transitDays: 0,
      createdAt: now,
    }),
  ])
  return { status: 'posted', opensOn: link.opensOn }
}
