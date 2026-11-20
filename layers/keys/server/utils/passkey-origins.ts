// Passkeys across related origins (WebAuthn's Related Origin Requests).
//
// A passkey belongs to one relying-party id, and its PRF output opens the
// account key. To use one passkey on a second domain, every deployment pins
// the same id (NUXT_WEBAUTHN_RP_ID, read by nuxt-auth-utils' handlers), and the
// id's own host lists the other domains at /.well-known/webauthn
// (NUXT_WEBAUTHN_RELATED_ORIGINS). The browser checks that list before it lets
// a page on another domain use the id; the server checks it too, here, because
// nuxt-auth-utils verifies the response against whatever origin the request
// arrived on.
//
// Pure, so the rules are testable without Nitro.

/**
 * The vendored credentials layer's WebAuthn ceremony routes (each one wraps a
 * nuxt-auth-utils `defineWebAuthn*EventHandler`). The test fails if the layer
 * gains a ceremony route this list does not name.
 */
export const PASSKEY_CEREMONY_PATHS: readonly string[] = [
  '/api/auth/credentials/passkey',
  '/api/auth/credentials/verify-passkey',
  '/api/credentials/passkeys/register',
]

function parseUrl(value: string): URL | null {
  try {
    return new URL(value.trim())
  } catch {
    return null
  }
}

/** An origin as the browser writes it, or null for anything that is not an https origin. */
function asOrigin(value: string): string | null {
  const url = parseUrl(value)
  return url?.protocol === 'https:' ? url.origin : null
}

/**
 * NUXT_WEBAUTHN_RELATED_ORIGINS, comma-separated. Nuxt parses an env value that
 * looks like JSON, so an array is read too. Entries that are not https origins
 * are dropped rather than trusted.
 */
export function parseRelatedOrigins(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const origins = entries
    .filter((entry): entry is string => typeof entry === 'string')
    .map(asOrigin)
    .filter((origin): origin is string => origin !== null)
  return [...new Set(origins)]
}

export interface PasskeyOriginPolicy {
  /** The origin the request arrived on: what nuxt-auth-utils sets as `expectedOrigin`. */
  origin: string
  /** `public.appUrl`: this deployment's own origin. */
  appUrl: string
  /** `webauthn.rpID`. Empty means the id follows the request's hostname. */
  rpID: string
  relatedOrigins: readonly string[]
}

/**
 * Whether a passkey ceremony may run on this origin. With no pinned id the
 * id is the request's own hostname, so a passkey works only where it was made
 * and there is nothing to check: today's behaviour, and what dev and preview
 * (whose per-version URLs differ from `appUrl`) rely on. With a pinned id, only
 * this deployment's own origin and the listed related origins are accepted.
 */
export function passkeyOriginAllowed({
  origin,
  appUrl,
  rpID,
  relatedOrigins,
}: PasskeyOriginPolicy): boolean {
  if (!rpID) return true
  return origin === parseUrl(appUrl)?.origin || relatedOrigins.includes(origin)
}

/** The body of /.well-known/webauthn, or null when there is nothing to declare. */
export function webauthnWellKnown(relatedOrigins: readonly string[]): { origins: string[] } | null {
  return relatedOrigins.length ? { origins: [...relatedOrigins] } : null
}
