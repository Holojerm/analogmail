// A write link's secret. It is worked out from the mantel's private key and
// the link's id, so every keeper's browser arrives at the same address without
// the secret being stored anywhere: the server keeps only its hash. One-way,
// so a card that is photographed gives away nothing about the key.

import { toBase64Url } from '#layers/keys/shared/utils/key-format'

const LABEL = 'dearmantel/v1/guest-link'
const SECRET_BYTES = 16
const text = new TextEncoder()

/** `mantelPrivateKey` is the key as keepers hold it (PKCS#8), the same bytes for each of them. */
export async function guestLinkSecret(
  mantelPrivateKey: Uint8Array<ArrayBuffer>,
  linkId: string,
): Promise<string> {
  const material = await crypto.subtle.importKey('raw', mantelPrivateKey, 'HKDF', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: text.encode(`${LABEL}\n${linkId}`),
    },
    material,
    SECRET_BYTES * 8,
  )
  return toBase64Url(new Uint8Array(bits))
}

/** What the server keeps of a secret: its SHA-256, hex, as the server computes it. */
export async function guestLinkSecretHash(secret: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', text.encode(secret)))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A new link's id: 16 random bytes, base64url. */
export const newGuestLinkId = () => toBase64Url(crypto.getRandomValues(new Uint8Array(16)))
