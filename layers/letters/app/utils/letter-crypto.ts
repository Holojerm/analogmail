// A letter's encryption, in the browser. Each letter has its own random
// content key. The body is sealed under it, and the key is wrapped once per
// reader to that reader's public key, so the server holds nothing it can open.

import { fromBase64Url, toBase64Url } from '../../../keys/shared/utils/key-format'

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const
const IV_BYTES = 12
const KEY_BYTES = 32
const text = new TextEncoder()

type Bytes = Uint8Array<ArrayBuffer>

export function newContentKey(): Bytes {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTES))
}

const aes = (raw: Bytes) =>
  crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])

// Bound to the letter's id, so one letter's ciphertext cannot be filed as another's.
const bodyContext = (letterId: string) => text.encode(`dearmantel/v1/letter\n${letterId}`)

export async function encryptLetter(
  contentKey: Bytes,
  letterId: string,
  plaintext: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: bodyContext(letterId) },
    await aes(contentKey),
    text.encode(plaintext),
  )
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`
}

/** Null when the key is wrong, the ciphertext is another letter's, or it is damaged. */
export async function decryptLetter(
  contentKey: Bytes,
  letterId: string,
  ciphertext: string,
): Promise<string | null> {
  const [version, ivText, sealedText] = ciphertext.split('.')
  const iv = fromBase64Url(ivText ?? '')
  const sealed = fromBase64Url(sealedText ?? '')
  if (version !== 'v1' || !iv || !sealed || iv.length !== IV_BYTES) return null
  try {
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: bodyContext(letterId) },
      await aes(contentKey),
      sealed,
    )
    return new TextDecoder().decode(opened)
  } catch {
    return null
  }
}

export interface ReaderContext {
  letterId: string
  /** Whose copy of the key this is. A wrap made for one reader opens for no other. */
  readerId: string
}

const wrapContext = (context: ReaderContext) =>
  text.encode(`dearmantel/v1/letter-key\n${context.letterId}\n${context.readerId}`)

async function sharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  oneTimePublic: Bytes,
): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
  const material = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: oneTimePublic,
      info: text.encode('dearmantel/v1/letter-key'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Wraps a letter's content key to a reader's public key (SPKI, base64url),
 * with a key pair made for this one wrap and thrown away.
 */
export async function wrapContentKey(
  readerPublicKey: string,
  contentKey: Bytes,
  context: ReaderContext,
): Promise<string> {
  const spki = fromBase64Url(readerPublicKey)
  if (!spki) throw new Error('The reader has no usable public key')
  const reader = await crypto.subtle.importKey('spki', spki, CURVE, false, [])
  const oneTime = await crypto.subtle.generateKey(CURVE, true, ['deriveBits'])
  const oneTimePublic = new Uint8Array(await crypto.subtle.exportKey('raw', oneTime.publicKey))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: wrapContext(context) },
    await sharedKey(oneTime.privateKey, reader, oneTimePublic),
    contentKey,
  )
  return `v1.${toBase64Url(oneTimePublic)}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`
}

/** Null when this is not the reader's wrap, not this letter's, or it is damaged. */
export async function unwrapContentKey(
  privateKey: CryptoKey,
  wrapped: string,
  context: ReaderContext,
): Promise<Bytes | null> {
  const [version, publicText, ivText, sealedText] = wrapped.split('.')
  const oneTimePublic = fromBase64Url(publicText ?? '')
  const iv = fromBase64Url(ivText ?? '')
  const sealed = fromBase64Url(sealedText ?? '')
  if (version !== 'v1' || !oneTimePublic || !iv || !sealed || iv.length !== IV_BYTES) return null
  try {
    const sender = await crypto.subtle.importKey('raw', oneTimePublic, CURVE, false, [])
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: wrapContext(context) },
      await sharedKey(privateKey, sender, oneTimePublic),
      sealed,
    )
    const key = new Uint8Array(opened)
    return key.length === KEY_BYTES ? key : null
  } catch {
    return null
  }
}
