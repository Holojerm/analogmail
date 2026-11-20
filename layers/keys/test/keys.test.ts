// Key storage against a real D1: a public key is set once, a wrap only lands
// on its owner, and a password reset removes exactly the password's wrap.

import { env } from 'cloudflare:test'
import { asc, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { getCredentialsPasswordHandlers } from '#layers/credentials/server/utils/credentials-hooks'
import { getAccountContributors } from '#server/utils/extensions'

import { generateAccountKeys, wrapPrivateKey } from '../app/utils/key-crypto'
import {
  createAccountKeys,
  createKeysSchema,
  getAccountKeys,
  putKeyWrap,
  putWrapSchema,
} from '../server/utils/keys'
import { registerKeysExtensions } from '../server/utils/keys-extensions'

const db = drizzle(env.DB, { schema })
const { users, userKeys, keyWraps, credentialPasskeys } = schema
const secret = (fill: number) => new Uint8Array(32).fill(fill)

async function newKeys(userId: string) {
  const keys = await generateAccountKeys()
  return {
    publicKey: keys.publicKey,
    passwordWrap: await wrapPrivateKey(secret(1), { userId, kind: 'password' }, keys.privateKey),
    recoveryWrap: await wrapPrivateKey(secret(2), { userId, kind: 'recovery' }, keys.privateKey),
  }
}

async function addPasskey(userId: string, id: string) {
  await db.insert(credentialPasskeys).values({ id, userId, publicKey: 'pk', name: 'Laptop' })
}

const wrapsOf = async (userId: string) =>
  (await db.select().from(keyWraps).where(eq(keyWraps.userId, userId)).orderBy(asc(keyWraps.kind)))
    .map((wrap) => `${wrap.kind}:${wrap.credentialId}`)
    .join(' ')

const run = (statements: BatchItem<'sqlite'>[]) =>
  db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

beforeEach(async () => {
  for (const table of [keyWraps, userKeys, credentialPasskeys, users]) await db.delete(table)
  for (const id of ['ann', 'bob']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
  }
})

describe('account keys', () => {
  it('are created once and read back with both wraps', async () => {
    const input = await newKeys('ann')

    expect(await getAccountKeys(db, 'ann')).toBeNull()
    expect(await createAccountKeys(db, 'ann', input)).toBe('created')

    expect(await getAccountKeys(db, 'ann')).toEqual({
      publicKey: input.publicKey,
      scheme: 1,
      wraps: expect.arrayContaining([
        { kind: 'password', credentialId: '', wrapped: input.passwordWrap },
        { kind: 'recovery', credentialId: '', wrapped: input.recoveryWrap },
      ]),
    })
  })

  it('never replace a public key', async () => {
    const first = await newKeys('ann')
    await createAccountKeys(db, 'ann', first)

    expect(await createAccountKeys(db, 'ann', await newKeys('ann'))).toBe('exists')

    expect((await getAccountKeys(db, 'ann'))!.publicKey).toBe(first.publicKey)
    expect(await wrapsOf('ann')).toBe('password: recovery:')
  })

  it("are only ever one person's", async () => {
    await createAccountKeys(db, 'ann', await newKeys('ann'))

    expect(await getAccountKeys(db, 'bob')).toBeNull()
  })

  it('are refused when the request is not key material', async () => {
    const input = await newKeys('ann')

    expect(createKeysSchema.safeParse(input).success).toBe(true)
    expect(createKeysSchema.safeParse({ ...input, publicKey: 'short' }).success).toBe(false)
    expect(createKeysSchema.safeParse({ ...input, passwordWrap: 'my password' }).success).toBe(
      false,
    )
    // One wrap besides the recovery code: never none, never both.
    const passkeyWrap = { credentialId: 'pk-1', wrapped: input.passwordWrap }
    const { passwordWrap: _password, ...noWrap } = input
    expect(createKeysSchema.safeParse(noWrap).success).toBe(false)
    expect(createKeysSchema.safeParse({ ...noWrap, passkeyWrap }).success).toBe(true)
    expect(createKeysSchema.safeParse({ ...input, passkeyWrap }).success).toBe(false)
  })

  it('made with Face ID, are wrapped under that passkey, and only one of the account’s own', async () => {
    const { passwordWrap: wrapped, ...input } = await newKeys('ann')
    await addPasskey('bob', 'bobs-passkey')

    expect(
      await createAccountKeys(db, 'ann', {
        ...input,
        passkeyWrap: { credentialId: 'bobs-passkey', wrapped },
      }),
    ).toBe('unknown-passkey')
    expect(await getAccountKeys(db, 'ann')).toBeNull()

    await addPasskey('ann', 'iphone')
    expect(
      await createAccountKeys(db, 'ann', {
        ...input,
        passkeyWrap: { credentialId: 'iphone', wrapped },
      }),
    ).toBe('created')
    expect(await wrapsOf('ann')).toBe('passkey:iphone recovery:')
  })
})

describe('a wrap', () => {
  beforeEach(async () => {
    await createAccountKeys(db, 'ann', await newKeys('ann'))
  })

  it('replaces the one for the same secret', async () => {
    const { passwordWrap } = await newKeys('ann')

    expect(
      await putKeyWrap(db, 'ann', { kind: 'password', credentialId: '', wrapped: passwordWrap }),
    ).toBe('saved')

    const keys = await getAccountKeys(db, 'ann')
    expect(keys!.wraps).toHaveLength(2)
    expect(keys!.wraps.find((wrap) => wrap.kind === 'password')!.wrapped).toBe(passwordWrap)
  })

  it("is added for the person's own passkey and no one else's", async () => {
    await addPasskey('ann', 'passkey-ann')
    await addPasskey('bob', 'passkey-bob')
    const { passwordWrap: wrapped } = await newKeys('ann')
    const put = (credentialId: string) =>
      putKeyWrap(db, 'ann', { kind: 'passkey', credentialId, wrapped })

    expect(await put('passkey-ann')).toBe('saved')
    expect(await put('passkey-bob')).toBe('unknown-passkey')
    expect(await wrapsOf('ann')).toBe('passkey:passkey-ann password: recovery:')
  })

  it('needs keys to exist first', async () => {
    const { passwordWrap: wrapped } = await newKeys('bob')

    expect(await putKeyWrap(db, 'bob', { kind: 'password', credentialId: '', wrapped })).toBe(
      'no-keys',
    )
  })

  it('names a passkey if and only if it is a passkey wrap', async () => {
    const { passwordWrap: wrapped } = await newKeys('ann')

    expect(putWrapSchema.safeParse({ kind: 'passkey', wrapped }).success).toBe(false)
    expect(putWrapSchema.safeParse({ kind: 'password', credentialId: 'x', wrapped }).success).toBe(
      false,
    )
    expect(putWrapSchema.safeParse({ kind: 'recovery', wrapped }).success).toBe(true)
  })

  it('goes when its passkey is removed', async () => {
    await addPasskey('ann', 'passkey-ann')
    const { passwordWrap: wrapped } = await newKeys('ann')
    await putKeyWrap(db, 'ann', { kind: 'passkey', credentialId: 'passkey-ann', wrapped })
    await db.delete(credentialPasskeys)

    const keys = await getAccountKeys(db, 'ann')

    expect(keys!.wraps.map((wrap) => wrap.kind).sort()).toEqual(['password', 'recovery'])
  })
})

describe('what keys registers', () => {
  beforeEach(async () => {
    registerKeysExtensions()
    await createAccountKeys(db, 'ann', await newKeys('ann'))
    await createAccountKeys(db, 'bob', await newKeys('bob'))
  })

  it("removes only the password's wrap when a password is reset by email", async () => {
    const [reset] = getCredentialsPasswordHandlers('reset').filter((h) => h.key === 'keys')

    await run(reset!.statements!(db, { userId: 'ann', at: new Date() }))

    expect(await wrapsOf('ann')).toBe('recovery:')
    expect(await wrapsOf('bob')).toBe('password: recovery:')
    expect(await getAccountKeys(db, 'ann')).not.toBeNull()
  })

  it('deletes the keys with the account', async () => {
    const [keys] = getAccountContributors().filter((contributor) => contributor.key === 'keys')

    expect(await keys!.countForDeletion!(db, 'ann')).toBe(2)
    await run(keys!.deletionStatements!(db, 'ann'))

    expect(await getAccountKeys(db, 'ann')).toBeNull()
    expect(await wrapsOf('ann')).toBe('')
    expect(await getAccountKeys(db, 'bob')).not.toBeNull()
  })
})
