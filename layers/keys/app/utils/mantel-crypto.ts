// A custodial mantel's key pair and the wrapped copies of its private half.
// WebCrypto only. The pair is made in a keeper's browser. The private key
// leaves it only wrapped: once per keeper, to that keeper's account public
// key, and once under the mantel's recovery code. Unlike an account key it is
// never kept on a device: it is unwrapped in memory when needed.

import { fromBase64Url, toBase64Url } from '../../shared/utils/key-format'
import { generateAccountKeys, type AccountKeys } from './key-crypto'

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const
const IV_BYTES = 12
const text = new TextEncoder()

type Bytes = Uint8Array<ArrayBuffer>

/** The same kind of pair an account has, so one letter scheme serves both. */
export const generateMantelKeys = (): Promise<AccountKeys> => generateAccountKeys()

export interface KeeperContext {
  mantelId: string
  /** Whose copy this is. A copy made for one keeper opens for no other. */
  keeperId: string
}

const KEEPER_LABEL = 'dearmantel/v1/mantel-key'
const keeperData = (context: KeeperContext) =>
  text.encode(`${KEEPER_LABEL}\n${context.mantelId}\n${context.keeperId}`)

async function sharedKey(privateKey: CryptoKey, publicKey: CryptoKey, oneTimePublic: Bytes) {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
  const material = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: oneTimePublic, info: text.encode(KEEPER_LABEL) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Wraps the mantel's private key (PKCS#8) to a keeper's account public key. */
export async function wrapMantelKeyForKeeper(
  keeperPublicKey: string,
  mantelPrivateKey: Bytes,
  context: KeeperContext,
): Promise<string> {
  const spki = fromBase64Url(keeperPublicKey)
  if (!spki) throw new Error('The keeper has no usable public key')
  const keeper = await crypto.subtle.importKey('spki', spki, CURVE, false, [])
  const oneTime = await crypto.subtle.generateKey(CURVE, true, ['deriveBits'])
  const oneTimePublic = new Uint8Array(await crypto.subtle.exportKey('raw', oneTime.publicKey))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: keeperData(context) },
    await sharedKey(oneTime.privateKey, keeper, oneTimePublic),
    mantelPrivateKey,
  )
  return `v1.${toBase64Url(oneTimePublic)}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`
}

/** Null when this is not the keeper's copy, not this mantel's, or it is damaged. */
export async function unwrapMantelKey(
  accountPrivateKey: CryptoKey,
  wrapped: string,
  context: KeeperContext,
): Promise<Bytes | null> {
  const [version, publicText, ivText, sealedText] = wrapped.split('.')
  const oneTimePublic = fromBase64Url(publicText ?? '')
  const iv = fromBase64Url(ivText ?? '')
  const sealed = fromBase64Url(sealedText ?? '')
  if (version !== 'v1' || !oneTimePublic || !iv || !sealed || iv.length !== IV_BYTES) return null
  try {
    const sender = await crypto.subtle.importKey('raw', oneTimePublic, CURVE, false, [])
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: keeperData(context) },
      await sharedKey(accountPrivateKey, sender, oneTimePublic),
      sealed,
    )
    return new Uint8Array(opened)
  } catch {
    return null
  }
}

const RECOVERY_LABEL = 'dearmantel/v1/mantel-key-recovery'

async function recoveryKey(code: Bytes): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', code, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: text.encode(RECOVERY_LABEL) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

const recoveryData = (mantelId: string) => text.encode(`${RECOVERY_LABEL}\n${mantelId}`)

/** Wraps the mantel's private key under its recovery code (the code's bytes). */
export async function wrapMantelKeyUnderCode(
  code: Bytes,
  mantelId: string,
  mantelPrivateKey: Bytes,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: recoveryData(mantelId) },
    await recoveryKey(code),
    mantelPrivateKey,
  )
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`
}

/** Null when the code is wrong, the copy is another mantel's, or it is damaged. */
export async function unwrapMantelKeyWithCode(
  code: Bytes,
  mantelId: string,
  wrapped: string,
): Promise<Bytes | null> {
  const [version, ivText, sealedText] = wrapped.split('.')
  const iv = fromBase64Url(ivText ?? '')
  const sealed = fromBase64Url(sealedText ?? '')
  if (version !== 'v1' || !iv || !sealed || iv.length !== IV_BYTES) return null
  try {
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: recoveryData(mantelId) },
      await recoveryKey(code),
      sealed,
    )
    return new Uint8Array(opened)
  } catch {
    return null
  }
}

/**
 * A public key as six groups of four hex digits, for two people to read to
 * each other before one wraps a key to the other. If the server had swapped
 * in a key of its own, the groups would not match.
 */
export async function keyFingerprint(publicKey: string): Promise<string | null> {
  const spki = fromBase64Url(publicKey)
  if (!spki) return null
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', spki))
  const hex = Array.from(digest.slice(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return hex.match(/.{4}/g)!.join(' ')
}

/**
 * A public key's fingerprint for a link: 16 bytes of its hash, base64url. It
 * rides in the fragment of a write link, which a browser never sends to a
 * server, so the page can tell whether the key it was handed is the one the
 * card was printed for.
 */
export async function keyFingerprintToken(publicKey: string): Promise<string | null> {
  const spki = fromBase64Url(publicKey)
  if (!spki) return null
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', spki))
  return toBase64Url(digest.slice(0, 16))
}
