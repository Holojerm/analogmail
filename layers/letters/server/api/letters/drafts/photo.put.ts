// PUT /api/letters/drafts/photo?id=<letter>&photo=<photo> — store a draft's
// photo. The body is the sealed file, which the server cannot open.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import {
  PHOTO_BYTES_MAX,
  PHOTO_BYTES_MIN,
  photoIdSchema,
} from '../../../../shared/utils/letter-photo'
import { photoStore } from '../../../utils/photo-store'
import { attachPhoto } from '../../../utils/photos'

const querySchema = z.object({ id: letterIdSchema, photo: photoIdSchema })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'letters-photo',
    limit: 20,
    windowSeconds: 60,
    identifier: user.id,
  })
  const query = await getValidatedQuery(event, querySchema.parse)
  if (Number(getHeader(event, 'content-length') ?? 0) > PHOTO_BYTES_MAX) {
    throw createError({ statusCode: 413, message: 'That photo is too large.' })
  }
  const raw = await readRawBody(event, false)
  if (!raw || raw.length < PHOTO_BYTES_MIN) {
    throw createError({ statusCode: 400, message: 'That is not a photo.' })
  }
  if (raw.length > PHOTO_BYTES_MAX) {
    throw createError({ statusCode: 413, message: 'That photo is too large.' })
  }

  const result = await attachPhoto(
    db,
    photoStore,
    user.id,
    { letterId: query.id, photoId: query.photo, bytes: new Uint8Array(raw) },
    await postNow(),
  )
  if (result === 'not-yours') {
    throw createError({
      statusCode: 404,
      message: 'That letter is not yours.',
    })
  }
  if (result === 'sealed') {
    throw createError({
      statusCode: 409,
      message: 'That letter is sealed. Recall it to change it.',
    })
  }
  return { ok: true }
})
