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

/** People in one family, the organiser included. Every letter is wrapped once per reader. */
export const FAMILY_MEMBERS_MAX = 20

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
  /** A mantel the inviter keeps: the invitation is to write to it. */
  mantelId: z.string().uuid().optional(),
  /** A family the inviter organises: the invitation is to join it. */
  familyId: z.string().uuid().optional(),
  /** With `mantelId`: the invitation is to read the child's news, not to write. */
  news: z.boolean().optional(),
})

/**
 * A mantel's name as it may appear in an email to a stranger: only if it would
 * pass as a person's display name. Otherwise the email does not use it.
 */
export const mailableMantelName = (name: string): string => {
  const parsed = displayNameSchema.safeParse(name)
  return parsed.success ? parsed.data : 'someone dear to them'
}

export type InviteStatus = 'open' | 'expired' | 'accepted' | 'unknown'

/** What the invite page is told about a link. Nothing here names the invitee. */
export interface InviteView {
  status: InviteStatus
  inviterName: string | null
  expiresAt: string | null
  /** Set when the invitation is to write to a kept mantel, not to the inviter. */
  mantelName?: string | null
  /** Set when the invitation is to join a family. */
  familyName?: string | null
  /** With `mantelName`: the invitation is to read the child's news, not to write. */
  news?: boolean
}

/** What an invitation is to: a person, a kept mantel, a child's news, or a family. */
export type InviteKind = 'person' | 'mantel' | 'news' | 'family'

/** What accepting gives back: enough to take the person to what they accepted. */
export interface AcceptedInvite {
  correspondenceId: string
  kind: InviteKind
  familyId: string | null
}

/**
 * An invitation sent to the signed-in person's own address that they have not
 * accepted. It is shown to them without the link, so that finishing sign-up on
 * another device does not lose it.
 */
export interface IncomingInviteView {
  id: string
  kind: InviteKind
  inviterName: string
  mantelName: string | null
  familyName: string | null
  expiresAt: string
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
