// Guest letters: what a write link is and what a guest may send through it.

import { z } from 'zod'

import { letterCiphertextSchema, letterIdSchema, letterKeySchema } from './letter-doc'

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
