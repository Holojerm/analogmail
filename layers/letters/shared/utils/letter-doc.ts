// What a letter is before it is encrypted, and the shapes the server accepts
// for the encrypted forms. The server validates only the envelope: it never
// sees a `LetterDoc`.

import { z } from 'zod'

import { letterPhotoSchema } from './letter-photo'
import { richDocSchema, richTextLength } from './rich-text'

/** Characters of text. Long enough for a very long letter. */
export const LETTER_BODY_MAX = 50_000

export const PAPERS = ['plain', 'soft', 'card'] as const
// The three after `typewriter` are handwriting faces.
export const FONTS = ['serif', 'sans', 'typewriter', 'hand', 'print', 'cursive'] as const
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
 * is gone. Version 2 holds rich text; version 1 held a plain string and was
 * replaced before anyone outside development had written a letter.
 */
export const letterDocSchema = z.object({
  v: z.literal(2),
  content: richDocSchema.refine((doc) => richTextLength(doc) <= LETTER_BODY_MAX),
  stationery: stationerySchema,
  from: z.string().max(60),
  photo: letterPhotoSchema.optional(),
})
export type LetterDoc = z.infer<typeof letterDocSchema>

/**
 * A decrypted letter, or null when it is not one. The text came from another
 * person's browser, so nothing about its shape is trusted, and a document
 * nested deep enough to exhaust the stack is refused like any other.
 */
export function parseLetterDoc(plaintext: string): LetterDoc | null {
  try {
    const parsed = letterDocSchema.safeParse(JSON.parse(plaintext))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// `v1.<iv>.<ciphertext>`, base64url. The cap leaves room for the longest
// letter in four-byte characters, with its formatting.
export const LETTER_CIPHERTEXT_MAX = 600_000
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
  /** The day the writer sealed it until, if they did. Their own choice, so theirs to see. */
  opensOn: string | null
}
