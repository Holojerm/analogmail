// A letter's encryption: the body opens only with its key and only as that
// letter, and a key wrapped for one reader opens for no one else.

import { describe, expect, it } from 'vitest'

import { generateAccountKeys, importPrivateKey } from '../../keys/app/utils/key-crypto'
import {
  decryptLetter,
  encryptLetter,
  newContentKey,
  unwrapContentKey,
  wrapContentKey,
} from '../app/utils/letter-crypto'
import { letterCiphertextSchema, letterKeySchema } from '../shared/utils/letter-doc'

const LETTER = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const OTHER = '9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d'

async function person() {
  const keys = await generateAccountKeys()
  return { publicKey: keys.publicKey, privateKey: await importPrivateKey(keys.privateKey) }
}

describe('the body', () => {
  it('round-trips under its key and has the shape the server accepts', async () => {
    const key = newContentKey()
    const sealed = await encryptLetter(key, LETTER, 'Dear Bob, — Ann ✉️')

    expect(letterCiphertextSchema.safeParse(sealed).success).toBe(true)
    expect(sealed).not.toContain('Bob')
    expect(await decryptLetter(key, LETTER, sealed)).toBe('Dear Bob, — Ann ✉️')
  })

  it('does not open with another key, as another letter, or when changed', async () => {
    const key = newContentKey()
    const sealed = await encryptLetter(key, LETTER, 'hello')

    expect(await decryptLetter(newContentKey(), LETTER, sealed)).toBeNull()
    expect(await decryptLetter(key, OTHER, sealed)).toBeNull()
    expect(await decryptLetter(key, LETTER, `${sealed.slice(0, -2)}AA`)).toBeNull()
    expect(await decryptLetter(key, LETTER, 'v2.x.y')).toBeNull()
  })

  it('never repeats a ciphertext for the same text', async () => {
    const key = newContentKey()
    expect(await encryptLetter(key, LETTER, 'same')).not.toBe(
      await encryptLetter(key, LETTER, 'same'),
    )
  })
})

describe('a wrapped key', () => {
  it('opens for its reader and has the shape the server accepts', async () => {
    const bob = await person()
    const key = newContentKey()
    const wrapped = await wrapContentKey(bob.publicKey, key, { letterId: LETTER, readerId: 'bob' })

    expect(letterKeySchema.safeParse(wrapped).success).toBe(true)
    const opened = await unwrapContentKey(bob.privateKey, wrapped, {
      letterId: LETTER,
      readerId: 'bob',
    })
    expect(opened && Array.from(opened)).toEqual(Array.from(key))
  })

  it('opens for nobody else, for no other letter, and not as another reader', async () => {
    const bob = await person()
    const eve = await person()
    const wrapped = await wrapContentKey(bob.publicKey, newContentKey(), {
      letterId: LETTER,
      readerId: 'bob',
    })

    expect(
      await unwrapContentKey(eve.privateKey, wrapped, { letterId: LETTER, readerId: 'bob' }),
    ).toBeNull()
    expect(
      await unwrapContentKey(bob.privateKey, wrapped, { letterId: OTHER, readerId: 'bob' }),
    ).toBeNull()
    expect(
      await unwrapContentKey(bob.privateKey, wrapped, { letterId: LETTER, readerId: 'eve' }),
    ).toBeNull()
    expect(
      await unwrapContentKey(bob.privateKey, 'v1.x.y.z', { letterId: LETTER, readerId: 'bob' }),
    ).toBeNull()
  })

  it('carries a whole letter from one person to another', async () => {
    const ann = await person()
    const bob = await person()
    const key = newContentKey()
    const body = await encryptLetter(key, LETTER, 'See you in June.')
    const forAnn = await wrapContentKey(ann.publicKey, key, { letterId: LETTER, readerId: 'ann' })
    const forBob = await wrapContentKey(bob.publicKey, key, { letterId: LETTER, readerId: 'bob' })

    for (const [reader, wrap, id] of [
      [ann, forAnn, 'ann'],
      [bob, forBob, 'bob'],
    ] as const) {
      const opened = await unwrapContentKey(reader.privateKey, wrap, {
        letterId: LETTER,
        readerId: id,
      })
      expect(await decryptLetter(opened!, LETTER, body)).toBe('See you in June.')
    }
  })
})
