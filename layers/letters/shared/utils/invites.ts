// The rules of an invitation that the browser and the server both apply.

import { z } from 'zod'

/** An invitation is good for this long; then the address it was sent to is deleted. */
export const INVITE_TTL_DAYS = 30
export const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000

/** Invitations one person may have waiting at once. */
export const MAX_OPEN_INVITES = 20

/**
 * A display name is printed in an email to someone who may not know the app,
 * so it is letters, digits, spaces and a little punctuation: nothing that can
 * read as a link, an address or a second line.
 */
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .,'’-]*$/u
export const DISPLAY_NAME_MAX = 40

export const displayNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1, 'Enter the name your friends know you by')
      .max(DISPLAY_NAME_MAX, `Keep it to ${DISPLAY_NAME_MAX} characters`)
      .regex(NAME_PATTERN, 'Use letters, spaces and simple punctuation')
      // "J. R. Tolkien" is a name; "bank.com" is an address.
      .refine((value) => !/\.[\p{L}\p{N}]/u.test(value), 'Put a space after a full stop'),
  )

export const inviteInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter an email address').max(254),
})

export type InviteStatus = 'open' | 'expired' | 'accepted' | 'unknown'

/** What the invite page is told about a link. Nothing here names the invitee. */
export interface InviteView {
  status: InviteStatus
  inviterName: string | null
  expiresAt: string | null
}

export interface PersonView {
  correspondenceId: string
  name: string
  since: string
}

export interface OpenInviteView {
  id: string
  email: string
  sentAt: string
  expiresAt: string
}
