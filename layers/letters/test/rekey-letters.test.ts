// A re-key in real keys, end to end: letters written to the old key open
// with the new one afterwards and no longer with the old, and a keeper who
// was not there gets the new key without anyone else being able to.

import { describe, expect, it } from 'vitest'

import { generateAccountKeys, importPrivateKey } from '#layers/keys/app/utils/key-crypto'
import {
  generateMantelKeys,
  unwrapMantelKey,
  unwrapMantelKeyHandover,
  wrapMantelKeyForHandover,
  wrapMantelKeyForKeeper,
} from '#layers/keys/app/utils/mantel-crypto'

import {
  decryptLetter,
  encryptLetter,
  newContentKey,
  unwrapContentKey,
  wrapContentKey,
} from '../app/utils/letter-crypto'
import { rewrapLetterKeys } from '../app/utils/rekey-letters'
import { letterKeySchema } from '../shared/utils/letter-doc'

const MANTEL = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const letterId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

async function account() {
  const keys = await generateAccountKeys()
  return { publicKey: keys.publicKey, privateKey: await importPrivateKey(keys.privateKey) }
}

/** A letter to the mantel as the server holds it: ciphertext, and its key wrapped to the mantel. */
async function letterTo(mantelPublicKey: string, n: number, text: string) {
  const id = letterId(n)
  const key = newContentKey()
  return {
    letterId: id,
    ciphertext: await encryptLetter(key, id, text),
    wrappedKey: await wrapContentKey(mantelPublicKey, key, { letterId: id, readerId: MANTEL }),
  }
}

describe('wrapping letter keys again', () => {
  it('lets the new key read every letter, and the old key none', async () => {
    const before = await generateMantelKeys()
    const after = await generateMantelKeys()
    const oldKey = await importPrivateKey(before.privateKey)
    const newKey = await importPrivateKey(after.privateKey)
    const written = [
      await letterTo(before.publicKey, 1, 'For when you are eighteen.'),
      await letterTo(before.publicKey, 2, 'May your table be long.'),
    ]

    const moved = await rewrapLetterKeys(oldKey, after.publicKey, MANTEL, written)

    expect(moved.map((key) => key.letterId)).toEqual(written.map((letter) => letter.letterId))
    for (const [index, key] of moved.entries()) {
      expect(letterKeySchema.safeParse(key.wrappedKey).success).toBe(true)
      const context = { letterId: key.letterId, readerId: MANTEL }
      const opened = await unwrapContentKey(newKey, key.wrappedKey, context)
      expect(opened).not.toBeNull()
      expect(await decryptLetter(opened!, key.letterId, written[index]!.ciphertext)).toBe(
        index === 0 ? 'For when you are eighteen.' : 'May your table be long.',
      )
      // The copy someone left with opens nothing that is stored now.
      expect(await unwrapContentKey(oldKey, key.wrappedKey, context)).toBeNull()
    }
  })

  it('carries over a copy that never opened, rather than stopping', async () => {
    const before = await generateMantelKeys()
    const after = await generateMantelKeys()
    const elsewhere = await generateMantelKeys()
    const good = await letterTo(before.publicKey, 1, 'Readable.')
    const never = await letterTo(elsewhere.publicKey, 2, 'Wrapped to the wrong key by its writer.')

    const moved = await rewrapLetterKeys(
      await importPrivateKey(before.privateKey),
      after.publicKey,
      MANTEL,
      [good, never],
    )
    expect(moved[0]!.wrappedKey).not.toBe(good.wrappedKey)
    expect(moved[1]).toEqual({ letterId: never.letterId, wrappedKey: never.wrappedKey })
  })
})

describe('handing the new key to a keeper who was not there', () => {
  it('opens for them alone: not for the server, and not for whoever left', async () => {
    const bob = await account()
    const cal = await account()
    const before = await generateMantelKeys()
    const after = await generateMantelKeys()
    const context = { mantelId: MANTEL, keeperId: 'bob' }
    // What each of them was given while they kept the mantel.
    const bobsCopy = await wrapMantelKeyForKeeper(bob.publicKey, before.privateKey, context)

    const handover = await wrapMantelKeyForHandover(
      bob.publicKey,
      before.privateKey,
      after.privateKey,
      context,
    )

    const previous = await unwrapMantelKey(bob.privateKey, bobsCopy, context)
    const opened = await unwrapMantelKeyHandover(bob.privateKey, previous!, handover, context)
    expect(Array.from(opened!)).toEqual(Array.from(after.privateKey))

    // Cal left with the old key, but has no part of Bob's.
    expect(
      await unwrapMantelKeyHandover(cal.privateKey, before.privateKey, handover, context),
    ).toBeNull()
    // Bob's account key alone is not enough either: the old key is needed too.
    expect(
      await unwrapMantelKeyHandover(bob.privateKey, after.privateKey, handover, context),
    ).toBeNull()
    // It is Bob's copy of this mantel's key, and nobody else's or any other's.
    expect(
      await unwrapMantelKeyHandover(bob.privateKey, before.privateKey, handover, {
        ...context,
        keeperId: 'cal',
      }),
    ).toBeNull()
  })

  it('gives a server that swapped the keeper’s key nothing', async () => {
    const server = await account()
    const before = await generateMantelKeys()
    const after = await generateMantelKeys()
    const context = { mantelId: MANTEL, keeperId: 'bob' }
    // The browser was told the server's key was Bob's.
    const handover = await wrapMantelKeyForHandover(
      server.publicKey,
      before.privateKey,
      after.privateKey,
      context,
    )
    // The server holds its own private key and every public key, never a mantel's private one.
    for (const guess of [after.privateKey.slice().fill(0), new Uint8Array(0)]) {
      expect(await unwrapMantelKeyHandover(server.privateKey, guess, handover, context)).toBeNull()
    }
  })
})
