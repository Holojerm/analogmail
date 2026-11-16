// Correspondences: who writes with whom.

import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import type { OpenInviteView, PersonView } from '../../shared/utils/invites'
import type { LettersDb } from './people'

/** The open correspondence two people share, if any. */
export async function openCorrespondenceBetween(
  db: LettersDb,
  a: string,
  b: string,
): Promise<string | null> {
  const { correspondences, correspondenceMembers: members } = tables
  const mine = db
    .select({ id: members.correspondenceId })
    .from(members)
    .where(and(eq(members.userId, a), isNull(members.leftAt)))
  const [row] = await db
    .select({ id: correspondences.id })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .where(
      and(
        eq(members.userId, b),
        isNull(members.leftAt),
        isNull(correspondences.closedAt),
        inArray(members.correspondenceId, mine),
      ),
    )
    .limit(1)
  return row?.id ?? null
}

/** The people someone writes with, and the invitations they have waiting. */
export async function listPeople(
  db: LettersDb,
  userId: string,
  now: Date,
): Promise<{ people: PersonView[]; invites: OpenInviteView[] }> {
  const { correspondences, correspondenceMembers: members, people, users, invites } = tables
  const mine = db
    .select({ id: members.correspondenceId })
    .from(members)
    .where(and(eq(members.userId, userId), isNull(members.leftAt)))
  const rows = await db
    .select({
      correspondenceId: correspondences.id,
      since: correspondences.createdAt,
      chosen: people.displayName,
      account: users.name,
    })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .innerJoin(users, eq(users.id, members.userId))
    .leftJoin(people, eq(people.userId, members.userId))
    .where(
      and(
        ne(members.userId, userId),
        isNull(members.leftAt),
        isNull(correspondences.closedAt),
        inArray(members.correspondenceId, mine),
      ),
    )
    .orderBy(correspondences.createdAt)

  const waiting = await db
    .select()
    .from(invites)
    .where(and(eq(invites.inviterId, userId), isNull(invites.acceptedAt)))
    .orderBy(invites.createdAt)

  return {
    people: rows.map((row) => ({
      correspondenceId: row.correspondenceId,
      name: row.chosen ?? row.account,
      since: row.since.toISOString(),
    })),
    invites: waiting
      .filter((invite) => invite.expiresAt > now && invite.inviteeEmail)
      .map((invite) => ({
        id: invite.id,
        email: invite.inviteeEmail!,
        sentAt: invite.createdAt.toISOString(),
        expiresAt: invite.expiresAt.toISOString(),
      })),
  }
}
