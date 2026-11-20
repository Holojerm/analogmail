// Refuses a passkey ceremony on an origin this deployment does not answer for,
// before the credentials layer's routes run (server/utils/passkey-origins.ts).
// Config is read the way nuxt-auth-utils' handlers read it, without the event,
// so the id checked here is the id they verify against.

import {
  PASSKEY_CEREMONY_PATHS,
  parseRelatedOrigins,
  passkeyOriginAllowed,
} from '../utils/passkey-origins'

export default defineEventHandler((event) => {
  const path = event.path.split('?')[0] ?? ''
  if (!PASSKEY_CEREMONY_PATHS.includes(path)) return

  const config = useRuntimeConfig()
  const allowed = passkeyOriginAllowed({
    origin: getRequestURL(event, { xForwardedProto: true }).origin,
    appUrl: config.public.appUrl,
    rpID: config.webauthn.rpID,
    relatedOrigins: parseRelatedOrigins(config.webauthnRelatedOrigins),
  })
  if (!allowed) {
    throw createError({
      statusCode: 403,
      message: 'Passkeys cannot be used on this address',
      data: { code: 'passkey_origin' },
    })
  }
})
