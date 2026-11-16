// Correspondences: who writes with whom.

import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import type { OpenInviteView, PersonView } from '../../shared/utils/invites'
import { isKeeper } from '#layers/keys/server/utils/mantels'

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

/**
 * The correspondence a keeper writes to a mantel they keep in, made on first
 * use. The mantel is its other member, under its own id, so sealing, transit
 * and delivery treat it as they treat a person.
 */
export async function openMantelCorrespondence(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  now: Date,
): Promise<string | null> {
  const { correspondences, correspondenceMembers: members } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const existing = await openCorrespondenceBetween(db, keeperId, mantelId)
  if (existing) return existing
  const id = crypto.randomUUID()
  await db.batch([
    db.insert(correspondences).values({ id, mantelId, createdAt: now, updatedAt: now }),
    db.insert(members).values([
      { correspondenceId: id, userId: keeperId, createdAt: now },
      { correspondenceId: id, userId: mantelId, createdAt: now },
    ]),
  ])
  return id
}

/** The people someone writes with, and the invitations they have waiting. */
export async function listPeople(
  db: LettersDb,
  userId: string,
  now: Date,
): Promise<{ people: PersonView[]; invites: OpenInviteView[] }> {
  const {
    correspondences,
    correspondenceMembers: members,
    people,
    users,
    mantels,
    invites,
  } = tables
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
      mantel: mantels.name,
    })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    // The other side is a person, or a kept mantel under its own id.
    .leftJoin(users, eq(users.id, members.userId))
    .leftJoin(people, eq(people.userId, members.userId))
    .leftJoin(mantels, eq(mantels.id, members.userId))
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
      name: row.chosen ?? row.account ?? row.mantel ?? '',
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
