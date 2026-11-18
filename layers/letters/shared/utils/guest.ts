// Guest letters: what a write link is and what a guest may send through it.

import { z } from 'zod'

import { PUBLIC_KEY_PATTERN } from '../../../keys/shared/utils/key-format'

import { letterCiphertextSchema, letterIdSchema, letterKeySchema } from './letter-doc'
import { photoIdSchema } from './letter-photo'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Letters one link accepts. A wedding has guests, not a crowd. */
export const GUEST_LETTERS_MAX = 300

export const guestLinkIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/)

/**
 * The part of a write link the server is never sent with the page: 16 bytes,
 * base64url, in the fragment beside the key's fingerprint. A guest's browser
 * presents it with every request, so the path alone opens nothing.
 */
export const guestLinkSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/)

/** A write link's fragment: the mantel key's fingerprint, a dot, the secret. */
export const guestLinkFragment = (fingerprint: string, secret: string) => `${fingerprint}.${secret}`

/** Null when the fragment is not a fingerprint and a secret. Takes it with or without the #. */
export function parseGuestLinkFragment(
  fragment: string,
): { fingerprint: string; secret: string } | null {
  const [fingerprint, secret, ...rest] = fragment.replace(/^#/, '').split('.')
  if (!fingerprint || !secret || rest.length > 0) return null
  if (!guestLinkSecretSchema.safeParse(secret).success) return null
  return { fingerprint, secret }
}

export const newGuestLinkSchema = z.object({
  mantelId: z.string().uuid(),
  /** Made in the keeper's browser, because the secret is derived from it. */
  id: guestLinkIdSchema,
  /** SHA-256 (hex) of the link's secret. The secret itself is never sent here. */
  secretHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** The mantel's public key the secret and the fingerprint were worked out from. */
  publicKey: z.string().regex(PUBLIC_KEY_PATTERN),
  /** The day every letter from this link opens: the first anniversary, say. */
  opensOn: day,
  /** The last day a guest may write. */
  closesOn: day,
})

export const guestLinkHolderSchema = z.object({
  link: guestLinkIdSchema,
  secret: guestLinkSecretSchema,
})

export const guestLetterSchema = guestLinkHolderSchema.extend({
  id: letterIdSchema,
  ciphertext: letterCiphertextSchema,
  /** The letter's key, wrapped to the mantel's public key. */
  wrappedKey: letterKeySchema,
  turnstileToken: z.string().max(2048).optional(),
})

export type GuestLetter = z.infer<typeof guestLetterSchema>

/** The same, for a letter that carries a photo: which sealed file is its photo. */
export const guestPhotoLetterSchema = guestLetterSchema.extend({ photoId: photoIdSchema })

// A letter with a photo travels as one body: four bytes giving the length of
// the letter's JSON, that JSON, then the sealed photo. One request, so a
// letter never arrives without the photo it names.
const HEAD_BYTES = 4

export function packGuestPhotoLetter(
  letter: z.infer<typeof guestPhotoLetterSchema>,
  photo: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode(JSON.stringify(letter))
  const packed = new Uint8Array(HEAD_BYTES + json.length + photo.length)
  new DataView(packed.buffer).setUint32(0, json.length)
  packed.set(json, HEAD_BYTES)
  packed.set(photo, HEAD_BYTES + json.length)
  return packed
}

/** Null when the body is not that shape. The letter inside is not yet checked. */
export function unpackGuestPhotoLetter(
  packed: Uint8Array,
): { letter: unknown; photo: Uint8Array } | null {
  if (packed.length < HEAD_BYTES) return null
  const length = new DataView(packed.buffer, packed.byteOffset, HEAD_BYTES).getUint32(0)
  const end = HEAD_BYTES + length
  if (length === 0 || end > packed.length) return null
  try {
    const letter: unknown = JSON.parse(new TextDecoder().decode(packed.subarray(HEAD_BYTES, end)))
    return { letter, photo: packed.subarray(end) }
  } catch {
    return null
  }
}

/** What anyone holding a write link is told. */
export type GuestLinkView =
  | { status: 'unknown' | 'closed' }
  | {
      status: 'open'
      mantelId: string
      mantelName: string
      /** SPKI, base64url. The guest's browser checks it against the link. */
      publicKey: string
      opensOn: string
      closesOn: string
    }
