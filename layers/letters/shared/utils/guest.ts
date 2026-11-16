// Guest letters: what a write link is and what a guest may send through it.

import { z } from 'zod'

import { letterCiphertextSchema, letterIdSchema, letterKeySchema } from './letter-doc'
import { photoIdSchema } from './letter-photo'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Letters one link accepts. A wedding has guests, not a crowd. */
export const GUEST_LETTERS_MAX = 300

export const guestLinkIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/)

export const newGuestLinkSchema = z.object({
  mantelId: z.string().uuid(),
  /** The day every letter from this link opens: the first anniversary, say. */
  opensOn: day,
  /** The last day a guest may write. */
  closesOn: day,
})

export const guestLetterSchema = z.object({
  link: guestLinkIdSchema,
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
