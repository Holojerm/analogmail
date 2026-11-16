// A letter's photo, sealed under the letter's own content key. Whoever can
// read the letter can open its photo, and nobody else can.

type Bytes = Uint8Array<ArrayBuffer>

const VERSION = 1
const IV_BYTES = 12
const text = new TextEncoder()

export interface PhotoContext {
  letterId: string
  photoId: string
}

// Bound to the letter and to the photo id written inside the letter, so a
// file cannot be filed under another letter or swapped for an earlier photo.
const photoContext = (context: PhotoContext) =>
  text.encode(`dearmantel/v1/letter-photo\n${context.letterId}\n${context.photoId}`)

const aes = (raw: Bytes) =>
  crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])

/** One version byte, the IV, then the ciphertext. */
export async function encryptPhoto(
  contentKey: Bytes,
  context: PhotoContext,
  image: ArrayBuffer,
): Promise<Bytes> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: photoContext(context) },
      await aes(contentKey),
      image,
    ),
  )
  const out = new Uint8Array(1 + IV_BYTES + sealed.length)
  out[0] = VERSION
  out.set(iv, 1)
  out.set(sealed, 1 + IV_BYTES)
  return out
}

/** Null when the key is wrong, the file is another photo's, or it is damaged. */
export async function decryptPhoto(
  contentKey: Bytes,
  context: PhotoContext,
  sealed: ArrayBuffer,
): Promise<ArrayBuffer | null> {
  const bytes = new Uint8Array(sealed)
  if (bytes[0] !== VERSION || bytes.length <= 1 + IV_BYTES) return null
  try {
    return await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: bytes.slice(1, 1 + IV_BYTES),
        additionalData: photoContext(context),
      },
      await aes(contentKey),
      bytes.slice(1 + IV_BYTES),
    )
  } catch {
    return null
  }
}
