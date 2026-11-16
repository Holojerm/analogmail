// GET /api/letters/photo/<letter> — the sealed photo of a letter the caller
// wrote or has received. Opening it does not mark the letter as read.

import { db } from '@nuxthub/db'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { photoStore } from '../../../utils/photo-store'
import { readPhoto } from '../../../utils/photos'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = letterIdSchema.safeParse(getRouterParam(event, 'id'))
  const sealed = id.success ? await readPhoto(db, photoStore, user.id, id.data) : null
  if (!sealed)
    throw createError({
      statusCode: 404,
      message: 'There is no photo here for you.',
    })
  setHeader(event, 'cache-control', 'private, no-store')
  return send(event, new Uint8Array(sealed), 'application/octet-stream')
})
