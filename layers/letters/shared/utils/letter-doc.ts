// What a letter is before it is encrypted, and the shapes the server accepts
// for the encrypted forms. The server validates only the envelope: it never
// sees a `LetterDoc`.

import { z } from 'zod'

import { letterPhotoSchema } from './letter-photo'

/** Characters of body text. Long enough for a very long letter. */
export const LETTER_BODY_MAX = 50_000

export const PAPERS = ['plain', 'soft', 'card'] as const
export const FONTS = ['serif', 'sans', 'typewriter'] as const
export const INKS = ['black', 'accent', 'faded'] as const

export const stationerySchema = z.object({
  paper: z.enum(PAPERS),
  font: z.enum(FONTS),
  ink: z.enum(INKS),
})
export type Stationery = z.infer<typeof stationerySchema>

export const DEFAULT_STATIONERY: Stationery = {
  paper: 'plain',
  font: 'serif',
  ink: 'black',
}

/**
 * The plaintext of a letter. `from` is the writer's name as they signed it,
 * kept inside the letter so it still says who wrote it after their account
 * is gone.
 */
export const letterDocSchema = z.object({
  v: z.literal(1),
  body: z.string().max(LETTER_BODY_MAX),
  stationery: stationerySchema,
  from: z.string().max(60),
  photo: letterPhotoSchema.optional(),
})
export type LetterDoc = z.infer<typeof letterDocSchema>

// `v1.<iv>.<ciphertext>`, base64url. The cap leaves room for the longest body
// in four-byte characters.
export const LETTER_CIPHERTEXT_MAX = 300_000
export const letterCiphertextSchema = z
  .string()
  .max(LETTER_CIPHERTEXT_MAX)
  .regex(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/)

// `v1.<one-time public key>.<iv>.<wrapped content key>`, base64url.
export const letterKeySchema = z
  .string()
  .regex(/^v1\.[A-Za-z0-9_-]{87}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{64}$/)

export const letterIdSchema = z.string().uuid()

/** What the writer may know about a letter they sealed. Never more than this. */
export type SentStatus =
  | { kind: 'draft' }
  | { kind: 'awaiting_pickup'; pickupAt: string; arrives: string }
  | { kind: 'in_transit'; arrives: string }
  | { kind: 'posted'; postmark: string }

export interface DeskLetter {
  id: string
  correspondenceId: string
  to: string
  updatedAt: string
  status: SentStatus
}
