// A letter's photo in the browser: made small enough to keep, sealed, and
// sent; and fetched and opened again for whoever can read the letter.

import { PHOTO_BYTES_MAX, PHOTO_LONG_EDGE, type LetterPhoto } from '../../shared/utils/letter-photo'
import { decryptPhoto, encryptPhoto } from './photo-crypto'

type Bytes = Uint8Array<ArrayBuffer>

interface Prepared {
  image: ArrayBuffer
  width: number
  height: number
}

/**
 * Redraws the picture at most 2560 px on its long edge, as a JPEG. Redrawing
 * also drops what the camera wrote into the file, the place it was taken
 * included. Null when the browser cannot read the file as a picture.
 */
export async function preparePhoto(file: Blob): Promise<Prepared | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return null
  }
  const scale = Math.min(1, PHOTO_LONG_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  // JPEG has no transparency: without this a cut-out picture turns black.
  // This is the picture's own background, not a colour of the interface.
  context.fillStyle = 'white'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.86),
  )
  return blob ? { image: await blob.arrayBuffer(), width, height } : null
}

// A data: address rather than a blob: one, which the content policy refuses.
const asDataUrl = (image: ArrayBuffer) =>
  new Promise<string | null>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(new Blob([image], { type: 'image/jpeg' }))
  })

export type PhotoUpload =
  | { ok: true; photo: LetterPhoto; url: string }
  | { ok: false; reason: 'unreadable' | 'too-large' | 'failed' }

/** Prepares, seals and stores a photo for a draft that already exists. */
export async function uploadLetterPhoto(
  contentKey: Bytes,
  letterId: string,
  file: Blob,
): Promise<PhotoUpload> {
  const prepared = await preparePhoto(file)
  if (!prepared) return { ok: false, reason: 'unreadable' }
  const id = crypto.randomUUID()
  const sealed = await encryptPhoto(contentKey, { letterId, photoId: id }, prepared.image)
  if (sealed.length > PHOTO_BYTES_MAX) return { ok: false, reason: 'too-large' }
  const url = await asDataUrl(prepared.image)
  if (!url) return { ok: false, reason: 'unreadable' }
  try {
    await $fetch('/api/letters/drafts/photo', {
      method: 'PUT',
      query: { id: letterId, photo: id },
      headers: { 'content-type': 'application/octet-stream' },
      body: sealed,
    })
  } catch {
    return { ok: false, reason: 'failed' }
  }
  return {
    ok: true,
    photo: { id, width: prepared.width, height: prepared.height, alt: '' },
    url,
  }
}

export async function removeLetterPhoto(letterId: string): Promise<boolean> {
  try {
    await $fetch('/api/letters/drafts/photo-remove', {
      method: 'POST',
      body: { id: letterId },
    })
    return true
  } catch {
    return false
  }
}

/** The photo as an image address, or null when it cannot be fetched or opened here. */
export async function loadLetterPhoto(
  contentKey: Bytes,
  letterId: string,
  photo: LetterPhoto,
  /** Set when the letter is on a mantel the reader keeps, not their own. */
  mantelId?: string,
): Promise<string | null> {
  try {
    const sealed = await $fetch<ArrayBuffer>(`/api/letters/photo/${letterId}`, {
      responseType: 'arrayBuffer',
      query: mantelId ? { mantel: mantelId } : undefined,
    })
    const image = await decryptPhoto(contentKey, { letterId, photoId: photo.id }, sealed)
    return image ? await asDataUrl(image) : null
  } catch {
    return null
  }
}
