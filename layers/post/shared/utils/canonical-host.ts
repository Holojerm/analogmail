// The app lives at one address. `www.` answers only to send people there:
// sessions and passkeys are bound to a single host.

/**
 * Where a request to `www.<the app's host>` should go, or null for any other
 * host. The target is built from the configured address, never from the
 * request's own host header.
 */
export function wwwRedirect(host: string, appUrl: string, pathAndQuery: string): string | null {
  let canonical: URL
  try {
    canonical = new URL(appUrl)
  } catch {
    return null
  }
  if (host.toLowerCase() !== `www.${canonical.host}`) return null
  const path = pathAndQuery.startsWith('/') && !pathAndQuery.startsWith('//') ? pathAndQuery : '/'
  return `${canonical.origin}${path}`
}
