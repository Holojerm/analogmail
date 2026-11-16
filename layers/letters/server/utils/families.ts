// Families: several people who write to all of each other. A family is a
// name on a correspondence with more than two members. A letter to it is an
// ordinary letter with a copy of its key for each reader, and each copy
// travels to that reader's own city.
//
// Someone who joins reads what is written after they join: earlier letters
// were never wrapped to their key, and nothing here changes that.

import { and, asc, eq, isNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { displayNameSchema, FAMILY_MEMBERS_MAX } from '../../shared/utils/invites'
import { returnInTransitTo } from './closing'
import { getDisplayName, type LettersDb } from './people'

async function activeMembers(db: LettersDb, correspondenceId: string) {
  const { correspondenceMembers: members, people, users } = tables
  const rows = await db
    .select({
      userId: members.userId,
      since: members.createdAt,
      chosen: people.displayName,
      account: users.name,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .leftJoin(people, eq(people.userId, members.userId))
    .where(and(eq(members.correspondenceId, correspondenceId), isNull(members.leftAt)))
    .orderBy(asc(members.createdAt))
  return rows.map((row) => ({
    userId: row.userId,
    name: row.chosen ?? row.account,
    since: row.since,
  }))
}

/** The organiser if they are still in it, otherwise whoever has been in it longest. */
const organiserOf = (family: { organiserId: string | null }, members: { userId: string }[]) =>
  members.find((member) => member.userId === family.organiserId)?.userId ??
  members[0]?.userId ??
  null

export type CreateFamilyResult =
  | { status: 'created'; id: string }
  | { status: 'needs-name' | 'bad-name' }

/** Starts a family with one member. The name appears in invitation email. */
export async function createFamily(
  db: LettersDb,
  userId: string,
  name: string,
  now: Date,
): Promise<CreateFamilyResult> {
  const { families, correspondences, correspondenceMembers: members } = tables
  if (!(await getDisplayName(db, userId))) return { status: 'needs-name' }
  const parsed = displayNameSchema.safeParse(name)
  if (!parsed.success) return { status: 'bad-name' }
  const id = crypto.randomUUID()
  const correspondenceId = crypto.randomUUID()
  await db.batch([
    db.insert(correspondences).values({ id: correspondenceId, createdAt: now, updatedAt: now }),
    db.insert(members).values({ correspondenceId, userId, createdAt: now }),
    db.insert(families).values({
      id,
      name: parsed.data,
      organiserId: userId,
      correspondenceId,
      createdAt: now,
    }),
  ])
  return { status: 'created', id }
}

/** The families a person is in. */
export async function listFamilies(db: LettersDb, userId: string) {
  const { families, correspondences, correspondenceMembers: members } = tables
  return db
    .select({ id: families.id, name: families.name, correspondenceId: families.correspondenceId })
    .from(members)
    .innerJoin(families, eq(families.correspondenceId, members.correspondenceId))
    .innerJoin(correspondences, eq(correspondences.id, families.correspondenceId))
    .where(
      and(eq(members.userId, userId), isNull(members.leftAt), isNull(correspondences.closedAt)),
    )
    .orderBy(asc(families.createdAt))
}

/** A family as one of its members sees it. Null for anyone else. */
export async function getFamily(db: LettersDb, userId: string, familyId: string, now: Date) {
  const { families, invites } = tables
  const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1)
  if (!family) return null
  const members = await activeMembers(db, family.correspondenceId)
  if (!members.some((member) => member.userId === userId)) return null
  const organiserId = organiserOf(family, members)
  const waiting =
    organiserId === userId
      ? await db
          .select({ id: invites.id, email: invites.inviteeEmail, expiresAt: invites.expiresAt })
          .from(invites)
          .where(and(eq(invites.familyId, familyId), isNull(invites.acceptedAt)))
      : []
  return {
    id: family.id,
    name: family.name,
    correspondenceId: family.correspondenceId,
    organiserId,
    me: userId,
    members: members.map((member) => ({
      userId: member.userId,
      name: member.name,
      since: member.since.toISOString(),
    })),
    invited: waiting
      .filter((row) => row.email && row.expiresAt > now)
      .map((row) => ({ id: row.id, email: row.email! })),
  }
}

/** Whether this person may invite to the family, and whether it has room. */
export async function canInviteToFamily(
  db: LettersDb,
  userId: string,
  familyId: string,
): Promise<{ name: string; correspondenceId: string } | 'not-organiser' | 'full'> {
  const { families } = tables
  const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1)
  if (!family) return 'not-organiser'
  const members = await activeMembers(db, family.correspondenceId)
  if (organiserOf(family, members) !== userId) return 'not-organiser'
  if (members.length >= FAMILY_MEMBERS_MAX) return 'full'
  return { name: family.name, correspondenceId: family.correspondenceId }
}

/**
 * Adds someone to a family's correspondence. Used by accepting an invitation.
 * Someone who left and comes back takes their old place.
 */
export async function joinFamily(
  db: LettersDb,
  userId: string,
  familyId: string,
  now: Date,
): Promise<string | 'gone' | 'full'> {
  const { families, correspondences, correspondenceMembers: members } = tables
  const [family] = await db
    .select({ correspondenceId: families.correspondenceId, closedAt: correspondences.closedAt })
    .from(families)
    .innerJoin(correspondences, eq(correspondences.id, families.correspondenceId))
    .where(eq(families.id, familyId))
    .limit(1)
  if (!family || family.closedAt) return 'gone'
  const current = await activeMembers(db, family.correspondenceId)
  if (current.some((member) => member.userId === userId)) return family.correspondenceId
  if (current.length >= FAMILY_MEMBERS_MAX) return 'full'
  await db
    .insert(members)
    .values({ correspondenceId: family.correspondenceId, userId, createdAt: now })
    .onConflictDoUpdate({
      target: [members.correspondenceId, members.userId],
      set: { leftAt: null, createdAt: now, updatedAt: now },
    })
  return family.correspondenceId
}

export type LeaveFamilyResult = 'left' | 'not-a-member'

/**
 * A member leaves, or the organiser removes one. The family goes on without
 * them. Letters still on their way to them go back to their senders; what
 * they already received stays theirs, and what they sent still arrives.
 */
export async function leaveFamily(
  db: LettersDb,
  actorId: string,
  familyId: string,
  memberId: string,
  now: Date,
): Promise<LeaveFamilyResult | 'not-organiser'> {
  const { families, correspondenceMembers: members } = tables
  const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1)
  if (!family) return 'not-a-member'
  const current = await activeMembers(db, family.correspondenceId)
  if (!current.some((member) => member.userId === memberId)) return 'not-a-member'
  if (actorId !== memberId && organiserOf(family, current) !== actorId) return 'not-organiser'
  await db
    .update(members)
    .set({ leftAt: now, updatedAt: now })
    .where(
      and(
        eq(members.correspondenceId, family.correspondenceId),
        eq(members.userId, memberId),
        isNull(members.leftAt),
      ),
    )
  await returnInTransitTo(db, memberId, now, family.correspondenceId)
  return 'left'
}

export type FamilyChange = 'done' | 'not-organiser' | 'bad-name'

async function organised(db: LettersDb, userId: string, familyId: string) {
  const { families, correspondences } = tables
  const [family] = await db
    .select({
      id: families.id,
      organiserId: families.organiserId,
      correspondenceId: families.correspondenceId,
      closedAt: correspondences.closedAt,
    })
    .from(families)
    .innerJoin(correspondences, eq(correspondences.id, families.correspondenceId))
    .where(eq(families.id, familyId))
    .limit(1)
  if (!family || family.closedAt) return null
  const members = await activeMembers(db, family.correspondenceId)
  return organiserOf(family, members) === userId ? { ...family, members } : null
}

/** The organiser gives the family another name. */
export async function renameFamily(
  db: LettersDb,
  userId: string,
  familyId: string,
  name: string,
  now: Date,
): Promise<FamilyChange> {
  const { families } = tables
  const family = await organised(db, userId, familyId)
  if (!family) return 'not-organiser'
  const parsed = displayNameSchema.safeParse(name)
  if (!parsed.success) return 'bad-name'
  await db
    .update(families)
    .set({ name: parsed.data, updatedAt: now })
    .where(eq(families.id, familyId))
  return 'done'
}

/**
 * The organiser closes the family for everyone. Nothing new can be written
 * in it. Letters still on their way go back to their senders, invitations
 * nobody has accepted are withdrawn, and what each person has received stays
 * theirs to read and to copy.
 */
export async function closeFamily(
  db: LettersDb,
  userId: string,
  familyId: string,
  now: Date,
): Promise<FamilyChange> {
  const { correspondences, invites } = tables
  const family = await organised(db, userId, familyId)
  if (!family) return 'not-organiser'
  const closed = await db
    .update(correspondences)
    .set({ closedAt: now, closedBy: userId, updatedAt: now })
    .where(and(eq(correspondences.id, family.correspondenceId), isNull(correspondences.closedAt)))
    .returning({ id: correspondences.id })
  if (closed.length === 0) return 'not-organiser'
  await db.delete(invites).where(and(eq(invites.familyId, familyId), isNull(invites.acceptedAt)))
  for (const member of family.members) {
    await returnInTransitTo(db, member.userId, now, family.correspondenceId)
  }
  return 'done'
}

/**
 * What the family room is told about families (layers/room asks through its
 * own seam and never reads these tables). A closed family still has its
 * members, so its room can be looked at and emptied.
 */
export async function familiesForRoom(db: LettersDb, userId: string, familyId?: string) {
  const { families, correspondences, correspondenceMembers: members } = tables
  const rows = await db
    .select({
      id: families.id,
      name: families.name,
      organiserId: families.organiserId,
      correspondenceId: families.correspondenceId,
      closedAt: correspondences.closedAt,
    })
    .from(members)
    .innerJoin(families, eq(families.correspondenceId, members.correspondenceId))
    .innerJoin(correspondences, eq(correspondences.id, families.correspondenceId))
    .where(
      and(
        eq(members.userId, userId),
        isNull(members.leftAt),
        familyId ? eq(families.id, familyId) : undefined,
      ),
    )
    .orderBy(asc(families.createdAt))
  const found = []
  for (const row of rows) {
    const current = await activeMembers(db, row.correspondenceId)
    found.push({
      id: row.id,
      name: row.name,
      closed: Boolean(row.closedAt),
      organiser: organiserOf(row, current) === userId,
    })
  }
  return found
}
