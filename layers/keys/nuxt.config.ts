// Keys: each person's key pair, the wrapped copies of its private half, and
// the recovery code. All encryption happens in the browser with WebCrypto
// (app/utils/key-crypto.ts); the server stores public keys and ciphertext it
// cannot open. Builds on the `credentials:unlock` hook of layers/credentials.
export default defineNuxtConfig({
  $meta: { name: 'keys' },
})
