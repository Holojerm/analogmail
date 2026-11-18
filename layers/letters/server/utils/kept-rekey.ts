// A mantel's re-key, as far as letters go. The keys layer changes the
// mantel's key (layers/keys/server/utils/rekey.ts); every letter key held for
// the mantel has to move with it, or the letters would be left wrapped to a
// key nobody is given any more. A keeper's browser wraps each one again to
// the new key. This stores them in the same transaction as the new key, and
// refuses the lot if a letter arrived that the browser did not see: no letter
// is ever left behind on the old key.
//
// The write link goes too. Its fragment is a fingerprint of the old key, so
// its cards stop matching; the keepers make a new link.

import { and, eq, isNull, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import { batchGuard, isGuardFailure } from '#layers/keys/server/utils/batch-guard'
import {
  rekeyPlan,
  rekeySchema,
  rekeyStatements,
  type RekeyRefusal,
} from '#layers/keys/server/utils/rekey'

import { letterIdSchema, letterKeySchema } from '../../shared/utils/letter-doc'
import type { LettersDb } from './people'

/** More than a mantel will hold in a lifetime, and what one request can carry. */
export const REKEY_LETTERS_MAX = 20_000

// A JSON list is one bound value (D1 caps a value at 2 MB), and each row of
// an update looks its key up in the list, so the work grows with the square
// of the chunk.
const CHUNK = 500

export const mantelRekeySchema = rekeySchema.extend({
  /** Every letter key held for the mantel, wrapped again to the new key. */
  letterKeys: z
    .array(z.object({ letterId: letterIdSchema, wrappedKey: letterKeySchema }))
    .max(REKEY_LETTERS_MAX),
})
export type MantelRekey = z.infer<typeof mantelRekeySchema>

/**
 * What a keeper's browser needs to re-key a mantel: the keys layer's plan, and
 * every letter key held for the mantel. That includes letters still sealed
 * or on their way: their keys must move too. A key alone opens nothing; the
 * letters themselves stay withheld as before.
 */
export async function mantelRekeyPlan(db: LettersDb, keeperId: string, mantelId: string) {
  const { letterKeys, guestLinks } = tables
  const plan = await rekeyPlan(db, keeperId, mantelId)
  if (!plan) return null
  const held = await db
    .select({ letterId: letterKeys.letterId, wrappedKey: letterKeys.wrappedKey })
    .from(letterKeys)
    .where(eq(letterKeys.userId, mantelId))
  const [link] = await db
    .select({ id: guestLinks.id })
    .from(guestLinks)
    .where(and(eq(guestLinks.mantelId, mantelId), isNull(guestLinks.revokedAt)))
    .limit(1)
  return { ...plan, letterKeys: held, hasWriteLink: Boolean(link) }
}

export type MantelRekeyResult = 'rekeyed' | RekeyRefusal

/**
 * Puts the new key in place: the mantel's key and its keepers' copies, every
 * letter key, and the write link, in one transaction. 'changed' means
 * something moved while the browser worked (a letter arrived, or another
 * keeper got there first) and nothing was stored: the browser starts again.
 */
export async function rekeyMantel(
  db: LettersDb,
  keeperId: string,
  input: MantelRekey,
  now: Date,
): Promise<MantelRekeyResult> {
  const { guestLinks, letterKeys } = tables
  const { mantelId, letterKeys: rewrapped, ...keys } = input
  const ready = await rekeyStatements(db, keeperId, { mantelId, ...keys }, now)
  if (ready.status !== 'ready') return ready.status

  const ids = JSON.stringify(rewrapped.map((key) => key.letterId))
  const statements: BatchItem<'sqlite'>[] = [
    // Every letter key the mantel holds is among the ones wrapped again.
    batchGuard(
      db,
      sql`NOT EXISTS (
        SELECT 1 FROM letter_keys
        WHERE user_id = ${mantelId} AND letter_id NOT IN (SELECT value FROM json_each(${ids}))
      )`,
    ),
  ]
  for (let i = 0; i < rewrapped.length; i += CHUNK) {
    const chunk = JSON.stringify(rewrapped.slice(i, i + CHUNK))
    statements.push(
      db
        .update(letterKeys)
        .set({
          wrappedKey: sql`(
            SELECT json_extract(j.value, '$.wrappedKey') FROM json_each(${chunk}) AS j
            WHERE json_extract(j.value, '$.letterId') = letter_keys.letter_id
          )`,
          updatedAt: now,
        })
        .where(
          and(
            eq(letterKeys.userId, mantelId),
            sql`letter_id IN (SELECT json_extract(value, '$.letterId') FROM json_each(${chunk}))`,
          ),
        ),
    )
  }
  statements.push(
    db
      .update(guestLinks)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(guestLinks.mantelId, mantelId), isNull(guestLinks.revokedAt))),
    ...ready.statements,
  )
  try {
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  } catch (error) {
    if (isGuardFailure(error)) return 'changed'
    throw error
  }
  return 'rekeyed'
}
