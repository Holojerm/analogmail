// Guest letters. A couple's anniversary mantel can have a write link, printed
// on a card. Whoever holds it can send one sealed letter after another to the
// mantel with no account: the letter is encrypted in their browser to the
// mantel's public key, so this code handles ciphertext and never a name.
//
// A guest has no city, so the letter has no transit: it arrives on the
// mantel's next mail day, sealed until the link's opening day. The link is on
// paper anyone can photograph, hence the closing day, the cap and the way to
// replace it.
//
// The link's path is not enough to use it. Its fragment carries a secret the
// keeper's browser derived from the mantel's key; only the hash is stored
// here, and every guest request must present the secret. Someone who saw the
// path alone (a log line, an address bar without the fragment) learns nothing
// and can send nothing.

import { and, count, desc, eq, isNull, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import * as tables from '@nuxthub/db/schema'

import { batchGuard, isGuardFailure, mantelKeyIs } from '#layers/keys/server/utils/batch-guard'
import { isKeeper } from '#layers/keys/server/utils/mantels'
import { sha256Hex, timingSafeEqual } from '#server/utils/hash'

import { GUEST_LETTERS_MAX, type GuestLinkView } from '../../shared/utils/guest'
import { photoStorageKey } from '../../shared/utils/letter-photo'
import { isSealedOn, mantelToday } from './kept-mantel'
import type { LettersDb } from './people'
import type { PhotoStore } from './photos'
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
  | {
      status:
        | 'not-keeper'
        | 'not-anniversary'
        | 'needs-post'
        | 'bad-dates'
        | 'exists'
        | 'key-changed'
    }

/**
 * Makes a mantel's write link, replacing the one it had. Letters already
 * sent through the old link stay; the old address stops working. The id and
 * the hash of the secret come from the keeper's browser, which derived the
 * secret from the mantel's key. `publicKey` is the mantel's key as that
 * browser knew it: a link made from a key the mantel no longer has would
 * match no card and be no use to any guest, so it is refused.
 */
export async function createGuestLink(
  db: LettersDb,
  keeperId: string,
  input: {
    mantelId: string
    id: string
    secretHash: string
    publicKey: string
    opensOn: string
    closesOn: string
  },
  now: Date,
): Promise<CreateGuestLinkResult> {
  const { guestLinks, mantels, postalProfiles, correspondences, correspondenceMembers } = tables
  if (!(await isKeeper(db, keeperId, input.mantelId))) return { status: 'not-keeper' }
  const [mantel] = await db
    .select({ kind: mantels.kind, closedAt: mantels.closedAt, publicKey: mantels.publicKey })
    .from(mantels)
    .where(eq(mantels.id, input.mantelId))
    .limit(1)
  if (!mantel || mantel.closedAt || mantel.kind !== 'anniversary') {
    return { status: 'not-anniversary' }
  }
  if (mantel.publicKey !== input.publicKey) return { status: 'key-changed' }
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

  const { id } = input
  const [taken] = await db
    .select({ id: guestLinks.id })
    .from(guestLinks)
    .where(eq(guestLinks.id, id))
    .limit(1)
  if (taken) return { status: 'exists' }

  const previous = await activeLink(db, input.mantelId)
  const correspondenceId = previous?.correspondenceId ?? crypto.randomUUID()
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
      secretHash: input.secretHash,
      mantelId: input.mantelId,
      correspondenceId,
      opensOn: input.opensOn,
      closesOn: input.closesOn,
      maxLetters: GUEST_LETTERS_MAX,
      createdBy: keeperId,
      createdAt: now,
    }),
  )
  statements.unshift(batchGuard(db, mantelKeyIs(input.mantelId, input.publicKey)))
  try {
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  } catch (error) {
    if (isGuardFailure(error)) return { status: 'key-changed' }
    throw error
  }
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

/** Who presents a write link: its id from the path and its secret from the fragment. */
export interface GuestLinkHolder {
  link: string
  secret: string
}

async function openLink(db: LettersDb, holder: GuestLinkHolder, now: Date) {
  const { guestLinks, mantels } = tables
  const [row] = await db
    .select({ link: guestLinks, mantel: mantels })
    .from(guestLinks)
    .innerJoin(mantels, eq(mantels.id, guestLinks.mantelId))
    .where(eq(guestLinks.id, holder.link))
    .limit(1)
  // A wrong secret is told exactly what a wrong id is: the path alone must
  // not even confirm that a link exists.
  if (!row || !timingSafeEqual(row.link.secretHash, await sha256Hex(holder.secret))) {
    return 'unknown' as const
  }
  const { link, mantel } = row
  if (link.revokedAt || mantel.closedAt) return 'closed' as const
  if ((await mantelToday(db, link.mantelId, now)) > link.closesOn) return 'closed' as const
  if ((await lettersFrom(db, link.id)) >= link.maxLetters) return 'closed' as const
  return { link, mantel }
}

/** What the write page is told: enough to check the key and say when it opens. */
export async function viewGuestLink(
  db: LettersDb,
  holder: GuestLinkHolder,
  now: Date,
): Promise<GuestLinkView> {
  const open = await openLink(db, holder, now)
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

/** A guest's photo: a sealed file, like any letter's, that the server cannot open. */
export interface GuestPhoto {
  store: PhotoStore
  id: string
  bytes: Uint8Array
}

/**
 * Takes a guest's letter: ciphertext and its key wrapped to the mantel. It is
 * final at once (there is nobody to recall it), sealed until the link's
 * opening day, and due on the mantel's next mail day. Its photo, if it has
 * one, is stored with it or not at all.
 */
export async function postGuestLetter(
  db: LettersDb,
  holder: GuestLinkHolder,
  letter: { id: string; ciphertext: string; wrappedKey: string },
  now: Date,
  photo?: GuestPhoto,
): Promise<PostGuestLetterResult> {
  const { letters, letterKeys, deliveries } = tables
  const open = await openLink(db, holder, now)
  if (typeof open === 'string') return { status: open }
  const { link } = open
  const [taken] = await db
    .select({ id: letters.id })
    .from(letters)
    .where(eq(letters.id, letter.id))
    .limit(1)
  if (taken) return { status: 'exists' }

  const today = await mantelToday(db, link.mantelId, now)
  const photoKey = photo ? photoStorageKey(letter.id, photo.id) : null
  if (photo && photoKey) await photo.store.put(photoKey, photo.bytes)
  try {
    await db.batch([
      // A re-key revokes the link in the same transaction that changes the
      // key. A letter wrapped to the old key is never stored after it.
      batchGuard(
        db,
        sql`EXISTS (SELECT 1 FROM guest_links WHERE id = ${link.id} AND revoked_at IS NULL)`,
      ),
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
        photoKey,
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
  } catch (error) {
    // No letter, so no photo: a file nothing names would never be deleted.
    if (photo && photoKey) await photo.store.remove([photoKey])
    if (isGuardFailure(error)) return { status: 'closed' }
    throw error
  }
  return { status: 'posted', opensOn: link.opensOn }
}

export type RemoveGuestLetterResult = 'removed' | 'not-keeper' | 'not-found' | 'sealed'

/**
 * A keeper takes a guest's letter off the mantel for good: the letter, its
 * key and its photo. Only a guest's letter, since nobody answers for it, and
 * only once its day has come, because until then no keeper can know what it
 * says.
 */
export async function removeGuestLetter(
  db: LettersDb,
  store: PhotoStore,
  keeperId: string,
  mantelId: string,
  letterId: string,
  now: Date,
): Promise<RemoveGuestLetterResult> {
  const { letters, letterKeys, deliveries, guestLinks } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return 'not-keeper'
  const [row] = await db
    .select({ opensOn: letters.opensOn, photoKey: letters.photoKey })
    .from(letters)
    .innerJoin(guestLinks, eq(guestLinks.id, letters.guestLinkId))
    .where(
      and(eq(letters.id, letterId), eq(letters.origin, 'guest'), eq(guestLinks.mantelId, mantelId)),
    )
    .limit(1)
  if (!row) return 'not-found'
  if (isSealedOn(row.opensOn, await mantelToday(db, mantelId, now))) return 'sealed'
  await db.batch([
    db.delete(deliveries).where(eq(deliveries.letterId, letterId)),
    db.delete(letterKeys).where(eq(letterKeys.letterId, letterId)),
    db.delete(letters).where(eq(letters.id, letterId)),
  ])
  if (row.photoKey) await store.remove([row.photoKey])
  return 'removed'
}
