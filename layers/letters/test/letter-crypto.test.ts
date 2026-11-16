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
import { decryptPhoto, encryptPhoto } from '../app/utils/photo-crypto'
import {
  DEFAULT_STATIONERY,
  letterCiphertextSchema,
  letterDocSchema,
  letterKeySchema,
} from '../shared/utils/letter-doc'

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

describe('a photo', () => {
  const PHOTO = '11111111-1111-4111-8111-111111111111'
  const image = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4]).buffer

  it('round-trips under the letter key, with a version byte in front', async () => {
    const key = newContentKey()
    const sealed = await encryptPhoto(key, { letterId: LETTER, photoId: PHOTO }, image)

    expect(sealed[0]).toBe(1)
    expect(sealed.length).toBe(1 + 12 + 8 + 16)
    const opened = await decryptPhoto(key, { letterId: LETTER, photoId: PHOTO }, sealed.buffer)
    expect(opened && Array.from(new Uint8Array(opened))).toEqual(Array.from(new Uint8Array(image)))
  })

  it('does not open with another key, for another letter, or as another photo', async () => {
    const key = newContentKey()
    const sealed = (await encryptPhoto(key, { letterId: LETTER, photoId: PHOTO }, image)).buffer

    expect(
      await decryptPhoto(newContentKey(), { letterId: LETTER, photoId: PHOTO }, sealed),
    ).toBeNull()
    expect(await decryptPhoto(key, { letterId: OTHER, photoId: PHOTO }, sealed)).toBeNull()
    expect(await decryptPhoto(key, { letterId: LETTER, photoId: OTHER }, sealed)).toBeNull()
    expect(
      await decryptPhoto(key, { letterId: LETTER, photoId: PHOTO }, new ArrayBuffer(4)),
    ).toBeNull()
  })

  it('is described inside the letter, within the size the letter allows', () => {
    const photo = { id: PHOTO, width: 2560, height: 1920, alt: 'The plum tree' }
    const doc = { v: 1, body: 'x', stationery: DEFAULT_STATIONERY, from: 'Ann' }

    expect(letterDocSchema.safeParse(doc).success).toBe(true)
    expect(letterDocSchema.safeParse({ ...doc, photo }).success).toBe(true)
    expect(letterDocSchema.safeParse({ ...doc, photo: { ...photo, width: 4000 } }).success).toBe(
      false,
    )
  })
})
