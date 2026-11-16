// A mantel's key: each wrapped copy opens only for its holder and only as
// that mantel's, and a fingerprint is the same wherever it is computed.

import { describe, expect, it } from 'vitest'

import { generateAccountKeys, importPrivateKey } from '../app/utils/key-crypto'
import {
  generateMantelKeys,
  keyFingerprint,
  unwrapMantelKey,
  unwrapMantelKeyWithCode,
  wrapMantelKeyForKeeper,
  wrapMantelKeyUnderCode,
} from '../app/utils/mantel-crypto'
import { WRAPPED_KEY_PATTERN } from '../shared/utils/key-format'
import { KEEPER_WRAP_PATTERN } from '../shared/utils/mantel-format'

const MANTEL = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const OTHER = '9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const code = (fill: number) => new Uint8Array(20).fill(fill)

async function keeper() {
  const keys = await generateAccountKeys()
  return { publicKey: keys.publicKey, privateKey: await importPrivateKey(keys.privateKey) }
}

describe("a keeper's copy", () => {
  it('opens for that keeper and has the shape the server accepts', async () => {
    const ann = await keeper()
    const mantel = await generateMantelKeys()
    const wrapped = await wrapMantelKeyForKeeper(ann.publicKey, mantel.privateKey, {
      mantelId: MANTEL,
      keeperId: 'ann',
    })

    expect(wrapped).toMatch(KEEPER_WRAP_PATTERN)
    const opened = await unwrapMantelKey(ann.privateKey, wrapped, {
      mantelId: MANTEL,
      keeperId: 'ann',
    })
    expect(opened && Array.from(opened)).toEqual(Array.from(mantel.privateKey))
  })

  it('opens for nobody else, for no other mantel, and not as another keeper', async () => {
    const ann = await keeper()
    const eve = await keeper()
    const mantel = await generateMantelKeys()
    const context = { mantelId: MANTEL, keeperId: 'ann' }
    const wrapped = await wrapMantelKeyForKeeper(ann.publicKey, mantel.privateKey, context)

    expect(await unwrapMantelKey(eve.privateKey, wrapped, context)).toBeNull()
    expect(
      await unwrapMantelKey(ann.privateKey, wrapped, { ...context, mantelId: OTHER }),
    ).toBeNull()
    expect(
      await unwrapMantelKey(ann.privateKey, wrapped, { ...context, keeperId: 'eve' }),
    ).toBeNull()
    expect(await unwrapMantelKey(ann.privateKey, 'v1.x.y.z', context)).toBeNull()
  })
})

describe('the copy under the recovery code', () => {
  it('opens with the code, for that mantel only', async () => {
    const mantel = await generateMantelKeys()
    const wrapped = await wrapMantelKeyUnderCode(code(7), MANTEL, mantel.privateKey)

    expect(wrapped).toMatch(WRAPPED_KEY_PATTERN)
    const opened = await unwrapMantelKeyWithCode(code(7), MANTEL, wrapped)
    expect(opened && Array.from(opened)).toEqual(Array.from(mantel.privateKey))
    expect(await unwrapMantelKeyWithCode(code(8), MANTEL, wrapped)).toBeNull()
    expect(await unwrapMantelKeyWithCode(code(7), OTHER, wrapped)).toBeNull()
  })
})

describe('a fingerprint', () => {
  it('is six groups of four hex digits, the same for the same key and different for another', async () => {
    const ann = await keeper()
    const eve = await keeper()
    const print = await keyFingerprint(ann.publicKey)

    expect(print).toMatch(/^([0-9a-f]{4} ){5}[0-9a-f]{4}$/)
    expect(await keyFingerprint(ann.publicKey)).toBe(print)
    expect(await keyFingerprint(eve.publicKey)).not.toBe(print)
    expect(await keyFingerprint('not a key!')).toBeNull()
  })
})
