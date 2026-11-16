// Invitations. One is the consent to correspond: it names its sender, carries
// no letter, lasts 30 days, and whoever holds the link may accept it once.
// The link's token is stored only as a hash.

import { and, count, eq, gt, isNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { base64url, sha256Hex } from '#server/utils/hash'
import { normalizeEmail } from '#server/utils/users'

import { INVITE_TTL_MS, MAX_OPEN_INVITES, type InviteView } from '../../shared/utils/invites'
import { openCorrespondenceBetween } from './correspondences'
import { getDisplayName, type LettersDb } from './people'

export function newInviteToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

export const hashInviteToken = (token: string) => sha256Hex(`invite:${token}`)

export type CreateInviteResult =
  | { status: 'created'; id: string; token: string; expiresAt: Date; inviterName: string }
  | { status: 'self' | 'needs-name' | 'already-writing' | 'pending' | 'too-many' }

/**
 * Makes an invitation to `email`. The answer never says whether that address
 * has an account, except that someone the inviter already writes with is
 * reported as such.
 */
export async function createInvite(
  db: LettersDb,
  inviter: { id: string; email: string },
  email: string,
  now: Date,
): Promise<CreateInviteResult> {
  const address = normalizeEmail(email)
  if (address === normalizeEmail(inviter.email)) return { status: 'self' }

  const inviterName = await getDisplayName(db, inviter.id)
  if (!inviterName) return { status: 'needs-name' }

  const { invites, users } = tables
  const open = and(
    eq(invites.inviterId, inviter.id),
    isNull(invites.acceptedAt),
    gt(invites.expiresAt, now),
  )
  const [waiting] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(open, eq(invites.inviteeEmail, address)))
    .limit(1)
  if (waiting) return { status: 'pending' }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, address))
    .limit(1)
  if (existing && (await openCorrespondenceBetween(db, inviter.id, existing.id))) {
    return { status: 'already-writing' }
  }

  const [total] = await db.select({ n: count() }).from(invites).where(open)
  if ((total?.n ?? 0) >= MAX_OPEN_INVITES) return { status: 'too-many' }

  const token = newInviteToken()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
  const [row] = await db
    .insert(invites)
    .values({
      inviterId: inviter.id,
      inviteeEmail: address,
      tokenHash: await hashInviteToken(token),
      expiresAt,
      createdAt: now,
    })
    .returning({ id: invites.id })
  return { status: 'created', id: row!.id, token, expiresAt, inviterName }
}

export async function findInviteRow(db: LettersDb, token: string) {
  const [row] = await db
    .select()
    .from(tables.invites)
    .where(eq(tables.invites.tokenHash, await hashInviteToken(token)))
    .limit(1)
  return row ?? null
}

/** What anyone holding the link may know: who sent it and whether it still stands. */
export async function viewInvite(db: LettersDb, token: string, now: Date): Promise<InviteView> {
  const row = await findInviteRow(db, token)
  if (!row) return { status: 'unknown', inviterName: null, expiresAt: null }
  const inviterName = await getDisplayName(db, row.inviterId)
  const status = row.acceptedAt ? 'accepted' : row.expiresAt <= now ? 'expired' : 'open'
  return { status, inviterName, expiresAt: row.expiresAt.toISOString() }
}

/** The inviter takes back an invitation nobody has accepted. */
export async function withdrawInvite(
  db: LettersDb,
  inviterId: string,
  inviteId: string,
): Promise<boolean> {
  const { invites } = tables
  const removed = await db
    .delete(invites)
    .where(
      and(eq(invites.id, inviteId), eq(invites.inviterId, inviterId), isNull(invites.acceptedAt)),
    )
    .returning({ id: invites.id })
  return removed.length > 0
}
