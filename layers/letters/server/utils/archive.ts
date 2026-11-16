// What a person may keep a copy of: the letters they sealed and the letters
// they have opened. Listing and fetching here marks nothing as read, and a
// letter that has arrived but is still unopened is counted, not handed over:
// making a copy must not be a way to open the post.

import { and, eq, isNotNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import type { ArchiveEntry, ArchiveSealed, ArchiveShelf } from '../../shared/utils/archive'
import { correspondenceLabels } from './correspondences'
import { displayNames } from './mantel'
import type { LettersDb } from './people'

export async function listArchive(db: LettersDb, userId: string): Promise<ArchiveShelf[]> {
  const { letters, deliveries } = tables
  const sent = await db
    .select({
      id: letters.id,
      correspondenceId: letters.correspondenceId,
      postmark: letters.postmarkDate,
    })
    .from(letters)
    .where(and(eq(letters.authorId, userId), isNotNull(letters.sealedAt)))
  const received = await db
    .select({
      id: letters.id,
      correspondenceId: letters.correspondenceId,
      authorId: letters.authorId,
      postmark: letters.postmarkDate,
      openedAt: deliveries.openedAt,
    })
    .from(deliveries)
    .innerJoin(letters, eq(letters.id, deliveries.letterId))
    .where(
      and(
        eq(deliveries.recipientId, userId),
        eq(deliveries.kind, 'letter'),
        eq(deliveries.state, 'delivered'),
      ),
    )

  const names = await displayNames(
    db,
    received.map((row) => row.authorId).filter((id): id is string => Boolean(id)),
  )
  const labels = await correspondenceLabels(db, userId)
  const shelves = new Map<string, ArchiveShelf>()
  const shelf = (correspondenceId: string) => {
    let found = shelves.get(correspondenceId)
    if (!found) {
      const label = labels.get(correspondenceId)
      found = {
        correspondenceId,
        name: label?.name ?? '',
        kind: label?.kind ?? 'person',
        entries: [],
        unopened: 0,
      }
      shelves.set(correspondenceId, found)
    }
    return found
  }
  for (const row of sent) {
    shelf(row.correspondenceId).entries.push({
      id: row.id,
      direction: 'sent',
      from: null,
      postmark: row.postmark,
    })
  }
  for (const row of received) {
    const target = shelf(row.correspondenceId)
    if (!row.openedAt) {
      target.unopened += 1
      continue
    }
    target.entries.push({
      id: row.id,
      direction: 'received',
      from: names.get(row.authorId ?? '') ?? null,
      postmark: row.postmark,
    })
  }

  const inOrder = (a: ArchiveEntry, b: ArchiveEntry) =>
    (a.postmark ?? '').localeCompare(b.postmark ?? '') || a.id.localeCompare(b.id)
  return [...shelves.values()]
    .map((found) => ({ ...found, entries: found.entries.sort(inOrder) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * One letter's ciphertext and the caller's own copy of its key: for a letter
 * they sealed, or one they have already opened. Null for anything else, and
 * it never records an opening.
 */
export async function readForArchive(
  db: LettersDb,
  userId: string,
  letterId: string,
): Promise<ArchiveSealed | null> {
  const { letters, letterKeys, deliveries } = tables
  const [letter] = await db
    .select({
      authorId: letters.authorId,
      sealedAt: letters.sealedAt,
      ciphertext: letters.ciphertext,
      photoKey: letters.photoKey,
    })
    .from(letters)
    .where(eq(letters.id, letterId))
    .limit(1)
  if (!letter?.sealedAt) return null
  if (letter.authorId !== userId) {
    const [opened] = await db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.letterId, letterId),
          eq(deliveries.recipientId, userId),
          eq(deliveries.kind, 'letter'),
          eq(deliveries.state, 'delivered'),
          isNotNull(deliveries.openedAt),
        ),
      )
      .limit(1)
    if (!opened) return null
  }
  const [key] = await db
    .select({ wrappedKey: letterKeys.wrappedKey })
    .from(letterKeys)
    .where(and(eq(letterKeys.letterId, letterId), eq(letterKeys.userId, userId)))
    .limit(1)
  if (!key) return null
  return {
    ciphertext: letter.ciphertext,
    wrappedKey: key.wrappedKey,
    hasPhoto: Boolean(letter.photoKey),
  }
}
