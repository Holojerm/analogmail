// What letters registers with core. Called once per isolate by
// layers/letters/server/plugins/letters.ts; tests call it directly.

import { and, count, eq, inArray, isNull, lt } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { registerAccountContributor, registerPurgeContributor } from '#server/utils/extensions'
import { registerPublicApiRoutes } from '#server/utils/public-routes'

import type { LettersDb } from './people'

const PURGE_BATCH = 500

/**
 * An invitation nobody accepted is deleted once it expires, and the address
 * it was sent to goes with it.
 */
export async function purgeExpiredInvites(
  db: LettersDb,
  now: Date,
): Promise<{ count: number; truncated: boolean }> {
  const { invites } = tables
  const expired = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(isNull(invites.acceptedAt), lt(invites.expiresAt, now)))
    .limit(PURGE_BATCH)
  if (expired.length === 0) return { count: 0, truncated: false }
  for (let i = 0; i < expired.length; i += 80) {
    const ids = expired.slice(i, i + 80).map((row) => row.id)
    await db.delete(invites).where(inArray(invites.id, ids))
  }
  return { count: expired.length, truncated: expired.length === PURGE_BATCH }
}

export function registerLettersExtensions(): void {
  const { invites, people, correspondences, correspondenceMembers: members } = tables

  // The invite page works signed out: the link is what its holder has.
  registerPublicApiRoutes([{ path: '/api/letters/invites/view', methods: ['POST'] }])

  registerPurgeContributor({
    key: 'invites',
    run: (db, options) => purgeExpiredInvites(db, new Date(options.now ?? Date.now())),
  })

  // Deleting an account withdraws its open invitations, forgets its chosen
  // name and closes its correspondences. Letters it sent stay with their
  // recipients; returning the ones still in transit is the leaving step's job.
  registerAccountContributor({
    key: 'letters',
    async countForDeletion(db, userId) {
      const [row] = await db
        .select({ total: count() })
        .from(members)
        .where(and(eq(members.userId, userId), isNull(members.leftAt)))
      return row?.total ?? 0
    },
    deletionStatements: (db, userId) => {
      const now = new Date()
      const mine = db
        .select({ id: members.correspondenceId })
        .from(members)
        .where(eq(members.userId, userId))
      return [
        db
          .update(correspondences)
          .set({ closedAt: now, closedBy: userId })
          .where(and(isNull(correspondences.closedAt), inArray(correspondences.id, mine))),
        db
          .update(members)
          .set({ leftAt: now })
          .where(and(eq(members.userId, userId), isNull(members.leftAt))),
        db.delete(invites).where(and(eq(invites.inviterId, userId), isNull(invites.acceptedAt))),
        db.delete(people).where(eq(people.userId, userId)),
      ]
    },
  })
}
