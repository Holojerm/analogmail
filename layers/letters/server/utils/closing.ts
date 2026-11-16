// Leaving: closing a correspondence, and what happens to letters on their way
// to someone who has left. Letters from the person who left still arrive.

import { and, eq, isNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { returnToSender } from '#layers/post/server/utils/returns'

import type { LettersDb } from './people'

/**
 * Sends back every letter still in transit to this person, in one
 * correspondence or in all of them. Returns how many went back.
 */
export async function returnInTransitTo(
  db: LettersDb,
  userId: string,
  now: Date,
  correspondenceId?: string,
): Promise<number> {
  const { deliveries, letters } = tables
  const waiting = await db
    .select({ id: deliveries.id, authorId: letters.authorId })
    .from(deliveries)
    .innerJoin(letters, eq(letters.id, deliveries.letterId))
    .where(
      and(
        eq(deliveries.recipientId, userId),
        eq(deliveries.kind, 'letter'),
        eq(deliveries.state, 'in_transit'),
        correspondenceId ? eq(letters.correspondenceId, correspondenceId) : undefined,
      ),
    )
  let returned = 0
  for (const delivery of waiting) {
    if (await returnToSender(db, delivery.id, delivery.authorId, now)) returned += 1
  }
  return returned
}

export type CloseResult = 'closed' | 'not-yours' | 'already-closed'

/**
 * Either person may close a correspondence. Nothing new can be sealed in it
 * afterwards. Letters on their way to the person who closed it go back to
 * their sender; letters that person already posted still arrive.
 */
export async function closeCorrespondence(
  db: LettersDb,
  userId: string,
  correspondenceId: string,
  now: Date,
): Promise<CloseResult> {
  const { correspondences, correspondenceMembers: members, families } = tables
  // A family is not closed by one member: they leave it (families.ts).
  const [family] = await db
    .select({ id: families.id })
    .from(families)
    .where(eq(families.correspondenceId, correspondenceId))
    .limit(1)
  if (family) return 'not-yours'
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.correspondenceId, correspondenceId),
        eq(members.userId, userId),
        isNull(members.leftAt),
      ),
    )
    .limit(1)
  if (!member) return 'not-yours'

  const closed = await db
    .update(correspondences)
    .set({ closedAt: now, closedBy: userId, updatedAt: now })
    .where(and(eq(correspondences.id, correspondenceId), isNull(correspondences.closedAt)))
    .returning({ id: correspondences.id })
  if (closed.length === 0) return 'already-closed'

  await returnInTransitTo(db, userId, now, correspondenceId)
  return 'closed'
}
