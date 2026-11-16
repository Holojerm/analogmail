// Text forms of key material: base64url for bytes on the wire, and the
// recovery code a person writes down. No crypto here, so the server's request
// schemas and the browser share one definition.

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

/** What a wrap protects the private key with. */
export const WRAP_KINDS = ['password', 'passkey', 'recovery'] as const
export type WrapKind = (typeof WRAP_KINDS)[number]

/** `v1.<iv>.<ciphertext>`, both base64url. A P-256 private key wraps to ~200 characters. */
export const WRAPPED_KEY_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{150,400}$/
/** A P-256 public key in SPKI form is 91 bytes. */
export const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{120,124}$/

// Crockford base32: no I, L, O or U, so a handwritten code reads back.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const RECOVERY_CODE_BYTES = 20

/** 20 bytes as eight groups of four: `7KQ2-…`. */
export function formatRecoveryCode(bytes: Uint8Array): string {
  let bits = 0
  let buffer = 0
  let text = ''
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      text += ALPHABET[(buffer >> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return text.match(/.{1,4}/g)!.join('-')
}

/** The bytes behind a typed code, or null. Forgives case, spacing and O/I/L. */
export function parseRecoveryCode(code: string): Uint8Array<ArrayBuffer> | null {
  const text = code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (text.length !== (RECOVERY_CODE_BYTES * 8) / 5) return null
  const bytes = new Uint8Array(RECOVERY_CODE_BYTES)
  let bits = 0
  let buffer = 0
  let index = 0
  for (const char of text) {
    const value = ALPHABET.indexOf(char)
    if (value === -1) return null
    buffer = ((buffer << 5) | value) & 0xfff
    bits += 5
    if (bits >= 8) {
      bytes[index] = (buffer >> (bits - 8)) & 0xff
      index += 1
      bits -= 8
    }
  }
  return bytes
}
