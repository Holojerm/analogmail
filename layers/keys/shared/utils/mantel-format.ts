// The shapes of a custodial mantel's key material, and the one rule every
// custody change follows. Shared by the browser, which makes the keys, and
// the server, which stores what it cannot open.

import { z } from 'zod'

import { PUBLIC_KEY_PATTERN, WRAPPED_KEY_PATTERN } from './key-format'

export const MANTEL_KINDS = ['child', 'anniversary'] as const
export type MantelKind = (typeof MANTEL_KINDS)[number]

export const KEEPER_ROLES = ['guardian', 'partner', 'successor'] as const
export type KeeperRole = (typeof KEEPER_ROLES)[number]

/** The role of whoever opens a mantel of each kind. */
export const FOUNDER_ROLE: Record<MantelKind, KeeperRole> = {
  child: 'guardian',
  anniversary: 'partner',
}

// `v1.<one-time public key>.<iv>.<wrapped private key>`, base64url: the
// mantel's private key wrapped to one keeper's account public key.
export const KEEPER_WRAP_PATTERN =
  /^v1\.[A-Za-z0-9_-]{87}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{150,400}$/

export const mantelNameSchema = z.string().trim().min(1).max(60)

export const newMantelSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(MANTEL_KINDS),
  name: mantelNameSchema,
  publicKey: z.string().regex(PUBLIC_KEY_PATTERN),
  keeperWrap: z.string().regex(KEEPER_WRAP_PATTERN),
  recoveryWrap: z.string().regex(WRAPPED_KEY_PATTERN),
})
export type NewMantel = z.infer<typeof newMantelSchema>

/** Days an offer of a keeper's seat stays open. */
export const PROPOSAL_TTL_DAYS = 30

/**
 * Whether a custody change is carried: more than half of the keepers, so two
 * keepers must both agree and neither can act on the other alone.
 */
export const carries = (votes: number, keepers: number) => keepers > 0 && votes * 2 > keepers
