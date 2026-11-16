// The account key pair and the wraps of its private half. WebCrypto only.
//
//   key pair   ECDH P-256. The public key is what letters are sealed to.
//   a wrap     AES-256-GCM over the private key (PKCS#8), under a key derived
//              with HKDF-SHA256 from one secret: the password's unlock key, a
//              passkey's PRF output, or the recovery code. Each is already
//              high-entropy, so no slow hash is needed here (the password's
//              was PBKDF2, in layers/credentials).
//
// The wrap is bound to its owner and kind through the GCM additional data, so
// one cannot be swapped for another or moved to another account.

import { fromBase64Url, toBase64Url, type WrapKind } from '../../shared/utils/key-format'

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const
const WRAP_INFO = new TextEncoder().encode('analogmail/v1/key-wrap')
const IV_BYTES = 12

export interface WrapContext {
  userId: string
  kind: WrapKind
  /** The passkey a `passkey` wrap belongs to. */
  credentialId?: string
}

export interface AccountKeys {
  /** SPKI, base64url. */
  publicKey: string
  /** PKCS#8. Held only long enough to wrap and to import. */
  privateKey: Uint8Array<ArrayBuffer>
}

export async function generateAccountKeys(): Promise<AccountKeys> {
  const pair = await crypto.subtle.generateKey(CURVE, true, ['deriveBits'])
  return {
    publicKey: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))),
    privateKey: new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
  }
}

/** The private key as this device keeps it between visits. */
export function importPrivateKey(pkcs8: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pkcs8, CURVE, true, ['deriveBits'])
}

export async function exportPrivateKey(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.exportKey('pkcs8', key))
}

async function wrappingKey(secret: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: WRAP_INFO },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function additionalData(context: WrapContext): Uint8Array<ArrayBuffer> {
  const parts = ['analogmail/v1', context.userId, context.kind, context.credentialId ?? '']
  return new TextEncoder().encode(parts.join('\n'))
}

export async function wrapPrivateKey(
  secret: Uint8Array<ArrayBuffer>,
  context: WrapContext,
  pkcs8: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(context) },
    await wrappingKey(secret),
    pkcs8,
  )
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`
}

/** Null when the secret is wrong, the wrap is for someone or something else, or it is damaged. */
export async function unwrapPrivateKey(
  secret: Uint8Array<ArrayBuffer>,
  context: WrapContext,
  wrapped: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const [version, ivText, sealedText] = wrapped.split('.')
  const iv = fromBase64Url(ivText ?? '')
  const sealed = fromBase64Url(sealedText ?? '')
  if (version !== 'v1' || !iv || !sealed || iv.length !== IV_BYTES) return null
  try {
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(context) },
      await wrappingKey(secret),
      sealed,
    )
    return new Uint8Array(opened)
  } catch {
    return null
  }
}
