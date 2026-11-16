// Accepting an invitation: the consent that makes a correspondence.

import { and, eq, isNull } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import * as tables from '@nuxthub/db/schema'

import { openCorrespondenceBetween } from './correspondences'
import { joinFamily } from './families'
import { findInviteRow } from './invites'
import { getDisplayName, type LettersDb } from './people'

export type AcceptResult =
  | { status: 'accepted'; correspondenceId: string }
  | { status: 'unknown' | 'expired' | 'own' | 'used' | 'needs-name' | 'needs-city' }

/**
 * Accepting is the consent. It needs a display name and a city, because the
 * other person will see the first and the post needs the second.
 *
 * Safe to repeat: the invitation is claimed first, by one person only, and a
 * claim that never got its correspondence gets it on the next call.
 */
export async function acceptInvite(
  db: LettersDb,
  token: string,
  accepterId: string,
  now: Date,
): Promise<AcceptResult> {
  const { invites, correspondences, correspondenceMembers: members, postalProfiles } = tables
  const invite = await findInviteRow(db, token)
  if (!invite) return { status: 'unknown' }
  // A keeper's own way to write to their mantel is the mantel's page.
  if (invite.inviterId === accepterId) return { status: 'own' }
  if (invite.acceptedAt && invite.acceptedBy !== accepterId) return { status: 'used' }
  if (invite.correspondenceId) {
    return { status: 'accepted', correspondenceId: invite.correspondenceId }
  }
  if (!invite.acceptedAt && invite.expiresAt <= now) return { status: 'expired' }

  if (!(await getDisplayName(db, accepterId))) return { status: 'needs-name' }
  const [profile] = await db
    .select({ userId: postalProfiles.userId })
    .from(postalProfiles)
    .where(eq(postalProfiles.userId, accepterId))
    .limit(1)
  if (!profile) return { status: 'needs-city' }

  if (!invite.acceptedAt) {
    const claimed = await db
      .update(invites)
      // The address has done its job; it is not kept.
      .set({ acceptedAt: now, acceptedBy: accepterId, inviteeEmail: null })
      .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt)))
      .returning({ id: invites.id })
    if (claimed.length === 0) return acceptInvite(db, token, accepterId, now)
  }

  if (invite.familyId) {
    // Joining a family adds a member to its one correspondence.
    const joined = await joinFamily(db, accepterId, invite.familyId, now)
    if (joined === 'gone' || joined === 'full') return { status: 'expired' }
    await db.update(invites).set({ correspondenceId: joined }).where(eq(invites.id, invite.id))
    return { status: 'accepted', correspondenceId: joined }
  }

  // To the inviter, or to the mantel they keep, which is a member under its
  // own id.
  const other = invite.mantelId ?? invite.inviterId
  const existing = await openCorrespondenceBetween(db, other, accepterId)
  const correspondenceId = existing ?? crypto.randomUUID()
  const statements: BatchItem<'sqlite'>[] = existing
    ? []
    : [
        db
          .insert(correspondences)
          .values({ id: correspondenceId, mantelId: invite.mantelId, createdAt: now }),
        db.insert(members).values([
          { correspondenceId, userId: other, createdAt: now },
          { correspondenceId, userId: accepterId, createdAt: now },
        ]),
      ]
  statements.push(db.update(invites).set({ correspondenceId }).where(eq(invites.id, invite.id)))
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return { status: 'accepted', correspondenceId }
}
