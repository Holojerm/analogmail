// GET /.well-known/webauthn
//
// The other origins that may use this host's passkeys (WebAuthn Related Origin
// Requests): a browser on one of them asks here before it lets the page use
// this host as the relying-party id. See server/utils/passkey-origins.ts.
//
// 404 while NUXT_WEBAUTHN_RELATED_ORIGINS is empty: no file is what the browser
// saw before this route existed, and it declares nothing, so an empty list
// would only be a second way of saying the same thing.

import { parseRelatedOrigins, webauthnWellKnown } from '../../utils/passkey-origins'

export default defineEventHandler((event) => {
  const body = webauthnWellKnown(parseRelatedOrigins(useRuntimeConfig().webauthnRelatedOrigins))

  if (!body) {
    setResponseStatus(event, 404)
    setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    return 'Not found\n'
  }

  // The browser rejects any other type. Public, read-only, fetched without credentials.
  setResponseHeader(event, 'Content-Type', 'application/json')
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  return JSON.stringify(body)
})
