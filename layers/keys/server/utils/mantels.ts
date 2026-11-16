// Custodial mantels and who keeps them. The server stores a mantel's public
// key and wrapped copies of its private key that it cannot open. What it
// guards: a public key is never replaced, a wrapped copy lands only on a
// keeper's own row, and nobody but a keeper learns anything about a mantel.

import { and, eq, isNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { FOUNDER_ROLE, type NewMantel } from '../../shared/utils/mantel-format'
import type { KeysDb } from './keys'

export type CreateMantelResult = 'created' | 'exists' | 'no-keys'

/**
 * Opens a mantel with its first keeper. The key pair was made in that
 * keeper's browser: this stores the public half, their wrapped copy of the
 * private half, and the copy under the recovery code, in one transaction.
 */
export async function createMantel(
  db: KeysDb,
  userId: string,
  input: NewMantel,
  now: Date,
): Promise<CreateMantelResult> {
  const { mantels, mantelKeepers, mantelKeyWraps, userKeys } = tables
  const [account] = await db
    .select({ userId: userKeys.userId })
    .from(userKeys)
    .where(eq(userKeys.userId, userId))
    .limit(1)
  if (!account) return 'no-keys'
  const [existing] = await db
    .select({ id: mantels.id })
    .from(mantels)
    .where(eq(mantels.id, input.id))
    .limit(1)
  if (existing) return 'exists'

  await db.batch([
    db.insert(mantels).values({
      id: input.id,
      kind: input.kind,
      name: input.name,
      publicKey: input.publicKey,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(mantelKeepers).values({
      mantelId: input.id,
      userId,
      role: FOUNDER_ROLE[input.kind],
      addedBy: userId,
      createdAt: now,
    }),
    db.insert(mantelKeyWraps).values([
      {
        mantelId: input.id,
        kind: 'keeper',
        keeperId: userId,
        wrapped: input.keeperWrap,
        createdAt: now,
      },
      { mantelId: input.id, kind: 'recovery', wrapped: input.recoveryWrap, createdAt: now },
    ]),
  ])
  return 'created'
}

/** The people who keep a mantel now. */
export async function keepersOf(db: KeysDb, mantelId: string) {
  const { mantelKeepers } = tables
  return db
    .select({
      userId: mantelKeepers.userId,
      role: mantelKeepers.role,
      since: mantelKeepers.createdAt,
    })
    .from(mantelKeepers)
    .where(and(eq(mantelKeepers.mantelId, mantelId), isNull(mantelKeepers.leftAt)))
}

export async function isKeeper(db: KeysDb, userId: string, mantelId: string): Promise<boolean> {
  return (await keepersOf(db, mantelId)).some((keeper) => keeper.userId === userId)
}

/** The mantels a person keeps. */
export async function listMantels(db: KeysDb, userId: string) {
  const { mantels, mantelKeepers } = tables
  return db
    .select({
      id: mantels.id,
      kind: mantels.kind,
      name: mantels.name,
      role: mantelKeepers.role,
      closedAt: mantels.closedAt,
    })
    .from(mantelKeepers)
    .innerJoin(mantels, eq(mantels.id, mantelKeepers.mantelId))
    .where(and(eq(mantelKeepers.userId, userId), isNull(mantelKeepers.leftAt)))
}

/**
 * A mantel as one of its keepers sees it: its public key, who keeps it, and
 * that keeper's own wrapped copy of the private key. Null for anyone else.
 */
export async function getMantel(db: KeysDb, userId: string, mantelId: string) {
  const { mantels, mantelKeyWraps } = tables
  const keepers = await keepersOf(db, mantelId)
  if (!keepers.some((keeper) => keeper.userId === userId)) return null
  const [mantel] = await db.select().from(mantels).where(eq(mantels.id, mantelId)).limit(1)
  if (!mantel) return null
  const [wrap] = await db
    .select({ wrapped: mantelKeyWraps.wrapped })
    .from(mantelKeyWraps)
    .where(
      and(
        eq(mantelKeyWraps.mantelId, mantelId),
        eq(mantelKeyWraps.kind, 'keeper'),
        eq(mantelKeyWraps.keeperId, userId),
      ),
    )
    .limit(1)
  return {
    id: mantel.id,
    kind: mantel.kind,
    name: mantel.name,
    publicKey: mantel.publicKey,
    closedAt: mantel.closedAt,
    keepers,
    wrappedKey: wrap?.wrapped ?? null,
  }
}
