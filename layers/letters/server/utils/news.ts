// News of a child: letters a child's keepers send out to the people they
// invited to read them, and to the child's own mantel when the writer says so.
//
// It is one correspondence per mantel. Its members are the keepers, who are
// the only ones who may write in it, and the readers, who can only read. A
// reader never learns who the other readers are: the list is served to
// keepers alone. The mantel is not a member: a letter's writer adds it as a
// reader for that letter (posting.ts).

import { and, eq, gt, inArray, isNotNull, isNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { isKeeper, keepersOf } from '#layers/keys/server/utils/mantels'

import { getDisplayName, type LettersDb } from './people'

/** People who may read one child's news. Every letter is wrapped once per reader. */
export const NEWS_READERS_MAX = 60

/** The child whose news this correspondence carries, or null when it is not news. */
export async function newsMantelOf(
  db: LettersDb,
  correspondenceId: string,
): Promise<{ mantelId: string; name: string } | null> {
  const { mantelNews, mantels } = tables
  const [row] = await db
    .select({ mantelId: mantels.id, name: mantels.name })
    .from(mantelNews)
    .innerJoin(mantels, eq(mantels.id, mantelNews.mantelId))
    .where(eq(mantelNews.correspondenceId, correspondenceId))
    .limit(1)
  return row ?? null
}

async function newsCorrespondence(db: LettersDb, mantelId: string): Promise<string | null> {
  const [row] = await db
    .select({ correspondenceId: tables.mantelNews.correspondenceId })
    .from(tables.mantelNews)
    .where(eq(tables.mantelNews.mantelId, mantelId))
    .limit(1)
  return row?.correspondenceId ?? null
}

/** Only a child's mantel that is still open has news. */
async function isOpenChildMantel(db: LettersDb, mantelId: string): Promise<boolean> {
  const { mantels } = tables
  const [mantel] = await db
    .select({ kind: mantels.kind, closedAt: mantels.closedAt })
    .from(mantels)
    .where(eq(mantels.id, mantelId))
    .limit(1)
  return Boolean(mantel) && mantel!.kind === 'child' && !mantel!.closedAt
}

async function seat(db: LettersDb, correspondenceId: string, userId: string, now: Date) {
  const { correspondenceMembers: members } = tables
  await db
    .insert(members)
    .values({ correspondenceId, userId, createdAt: now })
    .onConflictDoUpdate({
      target: [members.correspondenceId, members.userId],
      set: { leftAt: null, updatedAt: now },
    })
}

/**
 * Brings the news in line with who keeps the mantel now. Every current keeper
 * is in it, so each receives what another sends. Someone who kept the mantel
 * and no longer does is out of it, unless they were also asked to read: being
 * removed as a keeper must not leave them getting the child's news.
 *
 * Run before anything is planned, sealed or listed: keepers change through
 * custody, which knows nothing of news.
 */
export async function seatKeepers(
  db: LettersDb,
  mantelId: string,
  correspondenceId: string,
  now: Date,
): Promise<void> {
  const { correspondenceMembers: members, invites } = tables
  const keepers = (await keepersOf(db, mantelId)).map((keeper) => keeper.userId)
  const seated = await db
    .select({ userId: members.userId })
    .from(members)
    .where(and(eq(members.correspondenceId, correspondenceId), isNull(members.leftAt)))
  for (const keeper of keepers) {
    if (!seated.some((row) => row.userId === keeper)) await seat(db, correspondenceId, keeper, now)
  }
  const others = seated.filter((row) => !keepers.includes(row.userId))
  if (others.length === 0) return
  // A reader is someone who accepted an invitation to this child's news.
  const asked = await db
    .select({ userId: invites.acceptedBy })
    .from(invites)
    .where(
      and(eq(invites.mantelId, mantelId), eq(invites.news, true), isNotNull(invites.acceptedAt)),
    )
  for (const row of others) {
    if (!asked.some((invite) => invite.userId === row.userId)) {
      await endReading(db, correspondenceId, row.userId, now)
    }
  }
}

/**
 * The correspondence a keeper writes a child's news in, made on first use.
 * Null for anyone who does not keep the mantel, and for a mantel that is not
 * a child's or is closed.
 */
export async function openNews(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  now: Date,
): Promise<string | null> {
  const { correspondences, mantelNews } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  if (!(await isOpenChildMantel(db, mantelId))) return null
  let correspondenceId = await newsCorrespondence(db, mantelId)
  if (!correspondenceId) {
    const id = crypto.randomUUID()
    await db.batch([
      db.insert(correspondences).values({ id, createdAt: now, updatedAt: now }),
      // Two keepers opening it at once: the first row stands.
      db
        .insert(mantelNews)
        .values({ mantelId, correspondenceId: id, createdAt: now })
        .onConflictDoNothing(),
    ])
    correspondenceId = (await newsCorrespondence(db, mantelId))!
  }
  await seatKeepers(db, mantelId, correspondenceId, now)
  return correspondenceId
}

async function readerIds(db: LettersDb, mantelId: string, correspondenceId: string) {
  const { correspondenceMembers: members } = tables
  const keepers = (await keepersOf(db, mantelId)).map((keeper) => keeper.userId)
  const rows = await db
    .select({ userId: members.userId, since: members.createdAt })
    .from(members)
    .where(and(eq(members.correspondenceId, correspondenceId), isNull(members.leftAt)))
    .orderBy(members.createdAt)
  return rows.filter((row) => !keepers.includes(row.userId))
}

/** An accepted invitation makes its holder a reader. */
export async function joinNews(
  db: LettersDb,
  userId: string,
  mantelId: string,
  now: Date,
): Promise<string | 'gone' | 'full'> {
  const correspondenceId = await newsCorrespondence(db, mantelId)
  if (!correspondenceId || !(await isOpenChildMantel(db, mantelId))) return 'gone'
  const readers = await readerIds(db, mantelId, correspondenceId)
  if (readers.some((reader) => reader.userId === userId)) return correspondenceId
  if (readers.length >= NEWS_READERS_MAX) return 'full'
  await seat(db, correspondenceId, userId, now)
  return correspondenceId
}

export interface NewsReaders {
  correspondenceId: string
  readers: { userId: string; name: string; since: string }[]
  invites: { id: string; email: string; expiresAt: string; mine: boolean }[]
}

/** Who reads a child's news, and who has been asked. Served to its keepers only. */
export async function listNewsReaders(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  now: Date,
): Promise<NewsReaders | null> {
  const { invites } = tables
  const correspondenceId = await openNews(db, keeperId, mantelId, now)
  if (!correspondenceId) return null
  const readers = await readerIds(db, mantelId, correspondenceId)
  const waiting = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.mantelId, mantelId),
        eq(invites.news, true),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, now),
      ),
    )
    .orderBy(invites.createdAt)
  return {
    correspondenceId,
    readers: await Promise.all(
      readers.map(async (reader) => ({
        userId: reader.userId,
        name: (await getDisplayName(db, reader.userId)) ?? '',
        since: reader.since.toISOString(),
      })),
    ),
    invites: waiting
      .filter((invite) => invite.inviteeEmail)
      .map((invite) => ({
        id: invite.id,
        email: invite.inviteeEmail!,
        expiresAt: invite.expiresAt.toISOString(),
        mine: invite.inviterId === keeperId,
      })),
  }
}

/**
 * Ends one person's reading. Copies still on their way to them are dropped,
 * not returned: a keeper is not sent their own news back, and nothing tells
 * the other readers.
 */
async function endReading(db: LettersDb, correspondenceId: string, userId: string, now: Date) {
  const { correspondenceMembers: members, deliveries, letters, letterKeys } = tables
  await db
    .update(members)
    .set({ leftAt: now, updatedAt: now })
    .where(and(eq(members.correspondenceId, correspondenceId), eq(members.userId, userId)))
  const waiting = await db
    .select({ id: deliveries.id, letterId: deliveries.letterId })
    .from(deliveries)
    .innerJoin(letters, eq(letters.id, deliveries.letterId))
    .where(
      and(
        eq(deliveries.recipientId, userId),
        eq(deliveries.state, 'in_transit'),
        eq(letters.correspondenceId, correspondenceId),
      ),
    )
  for (let i = 0; i < waiting.length; i += 50) {
    const batch = waiting.slice(i, i + 50)
    await db.batch([
      db.delete(deliveries).where(
        inArray(
          deliveries.id,
          batch.map((row) => row.id),
        ),
      ),
      db.delete(letterKeys).where(
        and(
          eq(letterKeys.userId, userId),
          inArray(
            letterKeys.letterId,
            batch.map((row) => row.letterId),
          ),
        ),
      ),
    ])
  }
}

export type EndNewsResult = 'done' | 'not-keeper' | 'is-keeper' | 'not-a-reader'

/** Any keeper may stop someone reading. A keeper is not a reader and cannot be stopped. */
export async function removeNewsReader(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  readerId: string,
  now: Date,
): Promise<EndNewsResult> {
  if (!(await isKeeper(db, keeperId, mantelId))) return 'not-keeper'
  return stopReading(db, readerId, mantelId, now)
}

/** A reader stops reading. */
export async function leaveNews(
  db: LettersDb,
  userId: string,
  mantelId: string,
  now: Date,
): Promise<EndNewsResult> {
  return stopReading(db, userId, mantelId, now)
}

async function stopReading(db: LettersDb, userId: string, mantelId: string, now: Date) {
  if (await isKeeper(db, userId, mantelId)) return 'is-keeper' as const
  const correspondenceId = await newsCorrespondence(db, mantelId)
  if (!correspondenceId) return 'not-a-reader' as const
  const readers = await readerIds(db, mantelId, correspondenceId)
  if (!readers.some((reader) => reader.userId === userId)) return 'not-a-reader' as const
  await endReading(db, correspondenceId, userId, now)
  return 'done' as const
}

/** The children whose news a person reads, for their own page. Not ones they keep. */
export async function listNewsFor(db: LettersDb, userId: string) {
  const { correspondenceMembers: members, mantelNews, mantels } = tables
  const rows = await db
    .select({ mantelId: mantels.id, name: mantels.name, since: members.createdAt })
    .from(members)
    .innerJoin(mantelNews, eq(mantelNews.correspondenceId, members.correspondenceId))
    .innerJoin(mantels, eq(mantels.id, mantelNews.mantelId))
    .where(and(eq(members.userId, userId), isNull(members.leftAt), isNull(mantels.closedAt)))
    .orderBy(members.createdAt)
  const reading = []
  for (const row of rows) {
    if (await isKeeper(db, userId, row.mantelId)) continue
    reading.push({ mantelId: row.mantelId, name: row.name, since: row.since.toISOString() })
  }
  return reading
}
