// POST /api/letters/guest/post-photo — a guest's letter with its photo, as
// one binary body (shared/utils/guest.ts): the JSON the plain route takes
// plus the photo's id, then the sealed file. One request, so a letter never
// arrives without the photo it names, and the bot check and limits are passed
// once.

import { guestPhotoLetterSchema, unpackGuestPhotoLetter } from '../../../../shared/utils/guest'
import { LETTER_CIPHERTEXT_MAX } from '../../../../shared/utils/letter-doc'
import { PHOTO_BYTES_MAX, PHOTO_BYTES_MIN } from '../../../../shared/utils/letter-photo'
import { takeGuestLetter } from '../../../utils/guest-post'

const BODY_BYTES_MAX = PHOTO_BYTES_MAX + LETTER_CIPHERTEXT_MAX + 16_384

export default defineEventHandler(async (event) => {
  await rateLimit(event, { name: 'guest-post', limit: 6, windowSeconds: 3600 })
  if (Number(getHeader(event, 'content-length') ?? 0) > BODY_BYTES_MAX) {
    throw createError({ statusCode: 413, message: 'That photo is too large.' })
  }
  const raw = await readRawBody(event, false)
  if (raw && raw.length > BODY_BYTES_MAX) {
    throw createError({ statusCode: 413, message: 'That photo is too large.' })
  }
  const unpacked = raw ? unpackGuestPhotoLetter(new Uint8Array(raw)) : null
  const body = guestPhotoLetterSchema.safeParse(unpacked?.letter)
  if (!unpacked || !body.success) {
    throw createError({ statusCode: 400, message: 'That is not a letter with a photo.' })
  }
  if (unpacked.photo.length < PHOTO_BYTES_MIN) {
    throw createError({ statusCode: 400, message: 'That is not a photo.' })
  }
  if (unpacked.photo.length > PHOTO_BYTES_MAX) {
    throw createError({ statusCode: 413, message: 'That photo is too large.' })
  }
  const { photoId, ...sent } = body.data
  // A copy: the body's buffer is not ours to keep past this request.
  return takeGuestLetter(event, sent, { id: photoId, bytes: unpacked.photo.slice() })
})
