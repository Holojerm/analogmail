// Storage for public keys and wraps. The server cannot open a wrap; what it
// guards is that a public key is never replaced and that a wrap only ever
// lands on its owner's row. Every function takes the Drizzle client so the
// workerd suite drives it against a real D1 (layers/keys/test/keys.test.ts).

import { and, eq, notInArray } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/d1'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import {
  PUBLIC_KEY_PATTERN,
  WRAP_KINDS,
  WRAPPED_KEY_PATTERN,
  type WrapKind,
} from '../../shared/utils/key-format'

export type KeysDb = ReturnType<typeof drizzle<typeof tables>>

const wrapped = z.string().regex(WRAPPED_KEY_PATTERN)

/**
 * A new account's keys: the public key, its recovery wrap, and one wrap under
 * the secret the account was made with: a password, or a passkey's PRF output
 * for an account made with Face ID and no password.
 */
export const createKeysSchema = z
  .object({
    publicKey: z.string().regex(PUBLIC_KEY_PATTERN),
    passwordWrap: wrapped.optional(),
    passkeyWrap: z.object({ credentialId: z.string().min(1).max(1024), wrapped }).optional(),
    recoveryWrap: wrapped,
  })
  .refine((keys) => Boolean(keys.passwordWrap) !== Boolean(keys.passkeyWrap), {
    message: 'A new account has one wrap besides the recovery code: password or passkey',
  })

export type CreateKeysResult = 'created' | 'exists' | 'unknown-passkey'

export const putWrapSchema = z
  .object({
    kind: z.enum(WRAP_KINDS),
    credentialId: z.string().max(1024).default(''),
    wrapped,
  })
  .refine((wrap) => (wrap.kind === 'passkey') === (wrap.credentialId !== ''), {
    message: 'A passkey wrap names its passkey, and only a passkey wrap does',
  })

export interface AccountKeyRecord {
  publicKey: string
  scheme: number
  wraps: { kind: WrapKind; credentialId: string; wrapped: string }[]
}

/**
 * The caller's own public key and wraps, or null before their keys exist.
 * Wraps of passkeys that have since been removed are deleted on the way.
 */
export async function getAccountKeys(db: KeysDb, userId: string): Promise<AccountKeyRecord | null> {
  const { userKeys, keyWraps, credentialPasskeys } = tables
  const [key] = await db.select().from(userKeys).where(eq(userKeys.userId, userId))
  if (!key) return null

  const passkeys = db
    .select({ id: credentialPasskeys.id })
    .from(credentialPasskeys)
    .where(eq(credentialPasskeys.userId, userId))
  await db
    .delete(keyWraps)
    .where(
      and(
        eq(keyWraps.userId, userId),
        eq(keyWraps.kind, 'passkey'),
        notInArray(keyWraps.credentialId, passkeys),
      ),
    )

  const wraps = await db
    .select({
      kind: keyWraps.kind,
      credentialId: keyWraps.credentialId,
      wrapped: keyWraps.wrapped,
    })
    .from(keyWraps)
    .where(eq(keyWraps.userId, userId))
  return { publicKey: key.publicKey, scheme: key.scheme, wraps: wraps as AccountKeyRecord['wraps'] }
}

/** `exists` when the account already has keys: a public key is set once. */
export async function createAccountKeys(
  db: KeysDb,
  userId: string,
  input: z.infer<typeof createKeysSchema>,
): Promise<CreateKeysResult> {
  const { userKeys, keyWraps, credentialPasskeys } = tables
  if (input.passkeyWrap) {
    const [passkey] = await db
      .select({ id: credentialPasskeys.id })
      .from(credentialPasskeys)
      .where(
        and(
          eq(credentialPasskeys.userId, userId),
          eq(credentialPasskeys.id, input.passkeyWrap.credentialId),
        ),
      )
    if (!passkey) return 'unknown-passkey'
  }
  const [created] = await db
    .insert(userKeys)
    .values({ userId, publicKey: input.publicKey })
    .onConflictDoNothing()
    .returning({ userId: userKeys.userId })
  if (!created) return 'exists'
  const first = input.passkeyWrap
    ? { kind: 'passkey' as const, ...input.passkeyWrap }
    : { kind: 'password' as const, credentialId: '', wrapped: input.passwordWrap! }
  await db.insert(keyWraps).values([
    { userId, ...first },
    { userId, kind: 'recovery', wrapped: input.recoveryWrap },
  ])
  return 'created'
}

export type PutWrapResult = 'saved' | 'no-keys' | 'unknown-passkey'

/** Adds a wrap, or replaces the one for the same secret. */
export async function putKeyWrap(
  db: KeysDb,
  userId: string,
  wrap: z.infer<typeof putWrapSchema>,
): Promise<PutWrapResult> {
  const { userKeys, keyWraps, credentialPasskeys } = tables
  const [key] = await db
    .select({ userId: userKeys.userId })
    .from(userKeys)
    .where(eq(userKeys.userId, userId))
  if (!key) return 'no-keys'

  if (wrap.kind === 'passkey') {
    const [passkey] = await db
      .select({ id: credentialPasskeys.id })
      .from(credentialPasskeys)
      .where(
        and(eq(credentialPasskeys.userId, userId), eq(credentialPasskeys.id, wrap.credentialId)),
      )
    if (!passkey) return 'unknown-passkey'
  }

  await db
    .insert(keyWraps)
    .values({ userId, ...wrap })
    .onConflictDoUpdate({
      target: [keyWraps.userId, keyWraps.kind, keyWraps.credentialId],
      set: { wrapped: wrap.wrapped, updatedAt: new Date() },
    })
  return 'saved'
}
