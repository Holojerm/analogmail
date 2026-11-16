import { describe, expect, it } from 'vitest'

import {
  exportPrivateKey,
  generateAccountKeys,
  importPrivateKey,
  unwrapPrivateKey,
  wrapPrivateKey,
} from '../app/utils/key-crypto'
import {
  formatRecoveryCode,
  fromBase64Url,
  parseRecoveryCode,
  PUBLIC_KEY_PATTERN,
  RECOVERY_CODE_BYTES,
  toBase64Url,
  WRAPPED_KEY_PATTERN,
} from '../shared/utils/key-format'

const secret = (fill: number) => new Uint8Array(32).fill(fill)
const ann = { userId: 'ann', kind: 'password' } as const

describe('the account key pair', () => {
  it('has a public key and a private key in the forms the server expects', async () => {
    const keys = await generateAccountKeys()
    const wrapped = await wrapPrivateKey(secret(1), ann, keys.privateKey)

    expect(keys.publicKey).toMatch(PUBLIC_KEY_PATTERN)
    expect(wrapped).toMatch(WRAPPED_KEY_PATTERN)
  })

  it('survives being kept on the device and exported again', async () => {
    const keys = await generateAccountKeys()

    const kept = await importPrivateKey(keys.privateKey)

    expect(await exportPrivateKey(kept)).toEqual(keys.privateKey)
  })
})

describe('a wrap', () => {
  it('opens with the secret that made it', async () => {
    const keys = await generateAccountKeys()
    const wrapped = await wrapPrivateKey(secret(1), ann, keys.privateKey)

    expect(await unwrapPrivateKey(secret(1), ann, wrapped)).toEqual(keys.privateKey)
  })

  it('is different every time, so two wraps of one key cannot be matched', async () => {
    const keys = await generateAccountKeys()

    const first = await wrapPrivateKey(secret(1), ann, keys.privateKey)
    const second = await wrapPrivateKey(secret(1), ann, keys.privateKey)

    expect(first).not.toBe(second)
  })

  it('does not open with another secret', async () => {
    const keys = await generateAccountKeys()
    const wrapped = await wrapPrivateKey(secret(1), ann, keys.privateKey)

    expect(await unwrapPrivateKey(secret(2), ann, wrapped)).toBeNull()
  })

  it('does not open as another person, kind or passkey', async () => {
    const keys = await generateAccountKeys()
    const passkey = { userId: 'ann', kind: 'passkey', credentialId: 'key-1' } as const
    const wrapped = await wrapPrivateKey(secret(1), passkey, keys.privateKey)

    const as = (context: Parameters<typeof unwrapPrivateKey>[1]) =>
      unwrapPrivateKey(secret(1), context, wrapped)
    expect(await as(passkey)).toEqual(keys.privateKey)
    expect(await as({ ...passkey, userId: 'bob' })).toBeNull()
    expect(await as({ ...passkey, kind: 'recovery' })).toBeNull()
    expect(await as({ ...passkey, credentialId: 'key-2' })).toBeNull()
  })

  it('does not open when it has been altered or is not a wrap at all', async () => {
    const keys = await generateAccountKeys()
    const wrapped = await wrapPrivateKey(secret(1), ann, keys.privateKey)
    const flipped = wrapped.slice(0, -2) + (wrapped.endsWith('AA') ? 'BB' : 'AA')

    expect(await unwrapPrivateKey(secret(1), ann, flipped)).toBeNull()
    expect(await unwrapPrivateKey(secret(1), ann, 'v2.abc.def')).toBeNull()
    expect(await unwrapPrivateKey(secret(1), ann, '')).toBeNull()
  })
})

describe('the recovery code', () => {
  const bytes = Uint8Array.from({ length: RECOVERY_CODE_BYTES }, (_, index) => index * 13 + 7)

  it('is eight groups of four that read back to the same bytes', () => {
    const code = formatRecoveryCode(bytes)

    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(parseRecoveryCode(code)).toEqual(bytes)
  })

  it('forgives case, spacing and the letters people mistake for digits', () => {
    const code = formatRecoveryCode(bytes)
    const sloppy = code.toLowerCase().replace(/-/g, '  ').replace(/0/g, 'o').replace(/1/g, 'l')

    expect(parseRecoveryCode(sloppy)).toEqual(bytes)
  })

  it('refuses a code of the wrong length or with a letter that is never used', () => {
    const code = formatRecoveryCode(bytes)

    expect(parseRecoveryCode(code.slice(0, -1))).toBeNull()
    expect(parseRecoveryCode(`${code.slice(0, -1)}U`)).toBeNull()
    expect(parseRecoveryCode('')).toBeNull()
  })

  it('wraps and opens the private key like any other secret', async () => {
    const keys = await generateAccountKeys()
    const context = { userId: 'ann', kind: 'recovery' } as const
    const wrapped = await wrapPrivateKey(bytes, context, keys.privateKey)

    const typed = parseRecoveryCode(formatRecoveryCode(bytes))!
    expect(await unwrapPrivateKey(typed, context, wrapped)).toEqual(keys.privateKey)
  })
})

describe('base64url', () => {
  it('round-trips bytes and refuses other alphabets', () => {
    const bytes = new Uint8Array([0, 250, 251, 252, 253, 254, 255])

    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
    expect(toBase64Url(bytes)).not.toMatch(/[+/=]/)
    expect(fromBase64Url('a+b/')).toBeNull()
  })
})
