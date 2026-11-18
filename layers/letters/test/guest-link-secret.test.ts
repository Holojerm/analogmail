// A write link's secret: every keeper's browser derives the same one from the
// mantel's key and the link's id, and it gives nothing back.

import { describe, expect, it } from 'vitest'

import { generateMantelKeys } from '#layers/keys/app/utils/mantel-crypto'

import {
  guestLinkSecret,
  guestLinkSecretHash,
  newGuestLinkId,
} from '../app/utils/guest-link-secret'
import { guestLinkIdSchema, guestLinkSecretSchema } from '../shared/utils/guest'

describe("a write link's secret", () => {
  it('is the same wherever the mantel opens, and fits the link', async () => {
    const { privateKey } = await generateMantelKeys()
    const id = newGuestLinkId()
    expect(guestLinkIdSchema.safeParse(id).success).toBe(true)
    const secret = await guestLinkSecret(privateKey, id)
    expect(guestLinkSecretSchema.safeParse(secret).success).toBe(true)
    expect(await guestLinkSecret(privateKey.slice(), id)).toBe(secret)
  })

  it('differs for another link and for another mantel', async () => {
    const one = await generateMantelKeys()
    const other = await generateMantelKeys()
    const id = newGuestLinkId()
    const secret = await guestLinkSecret(one.privateKey, id)
    expect(await guestLinkSecret(one.privateKey, newGuestLinkId())).not.toBe(secret)
    expect(await guestLinkSecret(other.privateKey, id)).not.toBe(secret)
  })

  it('is stored as a SHA-256 the server can recompute', async () => {
    // SHA-256("abc"), from FIPS 180-2.
    expect(await guestLinkSecretHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
