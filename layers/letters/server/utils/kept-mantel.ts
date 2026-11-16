// A kept mantel's letters, for its keepers. Two gates, both here: nothing
// shows before its delivery, and a letter sealed until a day gives up its
// text, photo and key to nobody before that day on the mantel's calendar,
// keepers included. The seal is this code withholding the letter plus a key
// the server never has.

import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { isKeeper } from '#layers/keys/server/utils/mantels'
import { localParts } from '#layers/post/shared/utils/calendar'

import type { KeptItem, KeptLetter } from '../../shared/utils/kept'
import type { LettersDb } from './people'
import type { PhotoStore } from './photos'

/** Today's date where the mantel's post arrives. */
async function mantelToday(db: LettersDb, mantelId: string, now: Date): Promise<string> {
  const { postalProfiles } = tables
  const [profile] = await db
    .select({ timeZone: postalProfiles.timeZone })
    .from(postalProfiles)
    .where(eq(postalProfiles.userId, mantelId))
    .limit(1)
  return localParts(now, profile?.timeZone ?? 'UTC').date
}

/** Sealed while its day has not come. The day itself opens it. */
export const isSealedOn = (opensOn: string | null, today: string) =>
  Boolean(opensOn) && today < opensOn!

async function arrived(db: LettersDb, mantelId: string, letterId?: string) {
  const { deliveries, letters, people, users } = tables
  return db
    .select({
      deliveryId: deliveries.id,
      letterId: letters.id,
      postmark: letters.postmarkDate,
      arrivedOn: deliveries.mailDate,
      openedAt: deliveries.openedAt,
      opensOn: letters.opensOn,
      ciphertext: letters.ciphertext,
      photoKey: letters.photoKey,
      chosen: people.displayName,
      account: users.name,
    })
    .from(deliveries)
    .innerJoin(letters, eq(letters.id, deliveries.letterId))
    .leftJoin(users, eq(users.id, letters.authorId))
    .leftJoin(people, eq(people.userId, letters.authorId))
    .where(
      and(
        eq(deliveries.recipientId, mantelId),
        eq(deliveries.kind, 'letter'),
        eq(deliveries.state, 'delivered'),
        letterId ? eq(deliveries.letterId, letterId) : undefined,
      ),
    )
    .orderBy(desc(deliveries.deliveredAt))
}

/** What has arrived on a kept mantel. Null for anyone who does not keep it. */
export async function listKeptMantel(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  now: Date,
): Promise<KeptItem[] | null> {
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const today = await mantelToday(db, mantelId, now)
  return (await arrived(db, mantelId)).map((row) => ({
    letterId: row.letterId,
    name: row.chosen ?? row.account ?? null,
    postmark: row.postmark,
    arrivedOn: row.arrivedOn,
    opened: Boolean(row.openedAt),
    opensOn: row.opensOn,
    sealed: isSealedOn(row.opensOn, today),
  }))
}

/**
 * Opens a letter on a kept mantel for one of its keepers: its ciphertext and
 * the mantel's copy of its key. A sealed letter returns only its opening day.
 */
export async function openKeptLetter(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  letterId: string,
  now: Date,
): Promise<KeptLetter | null> {
  const { deliveries, letterKeys } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const [row] = await arrived(db, mantelId, letterId)
  if (!row) return null
  if (row.opensOn && isSealedOn(row.opensOn, await mantelToday(db, mantelId, now))) {
    return { sealed: true, letterId, postmark: row.postmark, opensOn: row.opensOn }
  }
  const [key] = await db
    .select({ wrappedKey: letterKeys.wrappedKey })
    .from(letterKeys)
    .where(and(eq(letterKeys.letterId, letterId), eq(letterKeys.userId, mantelId)))
    .limit(1)
  if (!key) return null
  if (!row.openedAt) {
    await db
      .update(deliveries)
      .set({ openedAt: now })
      .where(and(eq(deliveries.id, row.deliveryId), isNull(deliveries.openedAt)))
  }
  return {
    sealed: false,
    letterId,
    name: row.chosen ?? row.account ?? null,
    postmark: row.postmark,
    ciphertext: row.ciphertext,
    wrappedKey: key.wrappedKey,
    hasPhoto: Boolean(row.photoKey),
  }
}

/** The sealed photo file of a letter on a kept mantel, under the same two gates. */
export async function readKeptPhoto(
  db: LettersDb,
  store: PhotoStore,
  keeperId: string,
  mantelId: string,
  letterId: string,
  now: Date,
): Promise<ArrayBuffer | null> {
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const [row] = await arrived(db, mantelId, letterId)
  if (!row?.photoKey) return null
  if (isSealedOn(row.opensOn, await mantelToday(db, mantelId, now))) return null
  return store.get(row.photoKey)
}

/**
 * Who writes to a kept mantel, and the invitations its keepers have waiting.
 * Null for anyone who does not keep it.
 */
export async function listWriters(db: LettersDb, keeperId: string, mantelId: string, now: Date) {
  const { correspondences, correspondenceMembers: members, invites, people, users } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const writers = await db
    .select({ userId: members.userId, chosen: people.displayName, account: users.name })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .innerJoin(users, eq(users.id, members.userId))
    .leftJoin(people, eq(people.userId, members.userId))
    .where(
      and(
        eq(correspondences.mantelId, mantelId),
        isNull(correspondences.closedAt),
        isNull(members.leftAt),
        ne(members.userId, mantelId),
      ),
    )
  const waiting = await db
    .select({ id: invites.id, email: invites.inviteeEmail, expiresAt: invites.expiresAt })
    .from(invites)
    .where(
      and(eq(invites.mantelId, mantelId), isNull(invites.acceptedAt), gt(invites.expiresAt, now)),
    )
  return {
    writers: writers.map((row) => ({ userId: row.userId, name: row.chosen ?? row.account })),
    invited: waiting
      .filter((row) => row.email)
      .map((row) => ({ id: row.id, email: row.email!, expiresAt: row.expiresAt.toISOString() })),
  }
}
