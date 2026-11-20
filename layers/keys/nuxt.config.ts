// Keys: each person's key pair, the wrapped copies of its private half, and
// the recovery code. All encryption happens in the browser with WebCrypto
// (app/utils/key-crypto.ts); the server stores public keys and ciphertext it
// cannot open. Builds on the `credentials:unlock` hook of layers/credentials.
export default defineNuxtConfig({
  $meta: { name: 'keys' },
  runtimeConfig: {
    // A passkey's PRF output opens the account key, so one passkey serving
    // several domains needs one relying-party id on all of them
    // (server/utils/passkey-origins.ts).
    webauthn: {
      // NUXT_WEBAUTHN_RP_ID. nuxt-auth-utils' WebAuthn handlers read it; empty
      // means the request's hostname. Declared here so the env override applies
      // whatever the module declares.
      rpID: '',
    },
    // NUXT_WEBAUTHN_RELATED_ORIGINS: comma-separated https origins that may use
    // this host's passkeys, served at /.well-known/webauthn. Empty = none. A
    // top-level key, because the module types `webauthn` as its own options.
    webauthnRelatedOrigins: '',
  },
})
