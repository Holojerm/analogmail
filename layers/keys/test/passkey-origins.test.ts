// Passkeys across related origins: the pinned relying-party id, which origins
// may run a ceremony, and /.well-known/webauthn. The last block runs a real
// registration and sign-in through @simplewebauthn/server the way
// nuxt-auth-utils' handlers call it: `expectedRPID` from the pinned id and
// `expectedOrigin` from the request.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { describe, expect, it } from 'vitest'

import { PASSKEY_PRF_INPUT } from '../../credentials/app/utils/passkey-ceremony'
import { createSoftAuthenticator } from '../../credentials/test/lib/soft-authenticator'
import {
  PASSKEY_CEREMONY_PATHS,
  parseRelatedOrigins,
  passkeyOriginAllowed,
  webauthnWellKnown,
} from '../server/utils/passkey-origins'

const OWN = 'https://dearmantel.com'
const RELATED = 'https://norandeltracker.com'
const RP_ID = 'dearmantel.com'

const policy = (origin: string, rpID = RP_ID, related = [RELATED]) =>
  passkeyOriginAllowed({ origin, appUrl: OWN, rpID, relatedOrigins: related })

describe('production config (wrangler.toml [vars])', () => {
  // Nitro applies NUXT_* overrides from process.env, which Workers fills from
  // [vars] under nodejs_compat. NUXT_WEBAUTHN_RP_ID becomes webauthn.rpID.
  it('pins the relying-party id and lends it to the related origin', () => {
    expect(process.env.NUXT_WEBAUTHN_RP_ID).toBe(RP_ID)
    expect(parseRelatedOrigins(process.env.NUXT_WEBAUTHN_RELATED_ORIGINS)).toEqual([RELATED])
    expect(policy(new URL(process.env.NUXT_PUBLIC_APP_URL!).origin)).toBe(true)
  })
})

describe('parseRelatedOrigins', () => {
  it('reads a comma-separated list as origins', () => {
    expect(parseRelatedOrigins(' https://norandeltracker.com/ , https://b.example/path')).toEqual([
      RELATED,
      'https://b.example',
    ])
  })

  it('is empty for an unset value', () => {
    expect(parseRelatedOrigins('')).toEqual([])
    expect(parseRelatedOrigins(undefined)).toEqual([])
  })

  it('reads the array Nuxt makes of a JSON-looking value, and drops duplicates', () => {
    expect(parseRelatedOrigins([RELATED, `${RELATED}/`])).toEqual([RELATED])
  })

  it('drops anything that is not an https origin', () => {
    expect(
      parseRelatedOrigins('http://norandeltracker.com,javascript:alert(1),not a url,*'),
    ).toEqual([])
  })
})

describe('passkeyOriginAllowed', () => {
  it('accepts its own origin and the listed ones under a pinned id', () => {
    expect(policy(OWN)).toBe(true)
    expect(policy(RELATED)).toBe(true)
  })

  it('refuses any other origin under a pinned id', () => {
    expect(policy('https://evil.example')).toBe(false)
    expect(policy('https://www.dearmantel.com')).toBe(false)
    expect(policy('http://norandeltracker.com')).toBe(false)
    expect(policy(RELATED, RP_ID, [])).toBe(false)
  })

  it('checks nothing when the id follows the hostname, as before', () => {
    expect(policy('https://dearmantel-preview.example.workers.dev', '')).toBe(true)
    expect(policy('http://localhost:3000', '', [])).toBe(true)
  })

  it('names every ceremony route of the vendored credentials layer', () => {
    // Raw sources, so a route the template adds later is caught here.
    const routes = import.meta.glob('../../credentials/server/api/**/*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const ceremonies = Object.entries(routes)
      .filter(([, source]) => /defineWebAuthn\w*EventHandler\s*[<(]/.test(source))
      .map(([file]) => file.replace('../../credentials/server', '').replace(/\.\w+\.ts$/, ''))
    expect(ceremonies.length).toBeGreaterThan(0)
    expect([...ceremonies].sort()).toEqual([...PASSKEY_CEREMONY_PATHS].sort())
  })
})

describe('/.well-known/webauthn', () => {
  it('lists the related origins', () => {
    expect(webauthnWellKnown([RELATED])).toEqual({ origins: [RELATED] })
  })

  it('declares nothing when the list is empty', () => {
    expect(webauthnWellKnown([])).toBeNull()
  })
})

describe('a passkey on a related origin', () => {
  async function register(origin: string) {
    const authenticator = await createSoftAuthenticator({ origin, rpId: RP_ID, prf: 'full' })
    const options = await generateRegistrationOptions({
      rpID: RP_ID,
      rpName: 'App',
      userName: 'ada@example.com',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    })
    const response = (await authenticator.startRegistration({
      optionsJSON: options as never,
    })) as never
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response,
      expectedChallenge: options.challenge,
      expectedOrigin: origin,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    })
    return { authenticator, verified, credential: registrationInfo!.credential }
  }

  it('registers and signs in on a related origin under the pinned id, with PRF', async () => {
    expect(policy(RELATED)).toBe(true)
    const { authenticator, verified, credential } = await register(RELATED)
    expect(verified).toBe(true)

    const options = await generateAuthenticationOptions({ rpID: RP_ID })
    const response = (await authenticator.startAuthentication({
      optionsJSON: {
        ...options,
        extensions: { prf: { eval: { first: PASSKEY_PRF_INPUT } } },
      } as never,
    })) as { clientExtensionResults: { prf?: { results?: { first?: ArrayBuffer } } } }
    const result = await verifyAuthenticationResponse({
      response: response as never,
      expectedChallenge: options.challenge,
      expectedOrigin: RELATED,
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential,
    })
    expect(result.verified).toBe(true)
    expect(response.clientExtensionResults.prf?.results?.first?.byteLength).toBe(32)
  })

  it('fails when the id is left to follow the related hostname', async () => {
    const { authenticator, credential } = await register(RELATED)
    const options = await generateAuthenticationOptions({ rpID: RP_ID })
    const response = await authenticator.startAuthentication({ optionsJSON: options as never })
    await expect(
      verifyAuthenticationResponse({
        response: response as never,
        expectedChallenge: options.challenge,
        expectedOrigin: RELATED,
        expectedRPID: 'norandeltracker.com',
        requireUserVerification: false,
        credential,
      }),
    ).rejects.toThrow()
  })
})
