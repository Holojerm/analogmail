// Verifies a Svix-signed webhook (Resend signs with Svix) using WebCrypto.
// https://docs.svix.com/receiving/verifying-payloads/how-manual

const TOLERANCE_SECONDS = 5 * 60

function fromBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

export interface SvixHeaders {
  id?: string | null
  timestamp?: string | null
  signature?: string | null
}

/**
 * True when one of the `v1` signatures in the header matches the body and
 * the timestamp is within five minutes of `now`. `body` must be the raw
 * request body, byte for byte.
 */
export async function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  body: string,
  now: Date,
): Promise<boolean> {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature) return false
  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt)) return false
  if (Math.abs(now.getTime() / 1000 - sentAt) > TOLERANCE_SECONDS) return false

  const keyBytes = fromBase64(secret.replace(/^whsec_/, ''))
  if (!keyBytes) return false
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`)

  for (const entry of signature.split(' ')) {
    const [version, value] = entry.split(',')
    if (version !== 'v1' || !value) continue
    const candidate = fromBase64(value)
    // `verify` compares in constant time.
    if (candidate && (await crypto.subtle.verify('HMAC', key, candidate, signed))) return true
  }
  return false
}
