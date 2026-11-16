// POST /api/room/<family>/photos — one photo per request, as a form: `file`
// and `thumb` (both JPEGs the browser already made smaller, which also drops
// where the picture was taken), `width`, `height`, and an optional `albumId`.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import {
  ROOM_PHOTO_BYTES_MAX,
  ROOM_PHOTO_EDGE,
  ROOM_THUMB_BYTES_MAX,
} from '../../../../../shared/utils/room-types'
import { requireRoom } from '../../../../utils/room-access'
import { addRoomPhoto } from '../../../../utils/room-photos'
import { roomStore } from '../../../../utils/room-store'

const edge = z.coerce.number().int().min(1).max(ROOM_PHOTO_EDGE)
const fieldsSchema = z.object({ width: edge, height: edge, albumId: z.string().uuid().optional() })
const FORM_BYTES_MAX = ROOM_PHOTO_BYTES_MAX + ROOM_THUMB_BYTES_MAX + 16_384

export default defineEventHandler(async (event) => {
  const { user, family } = await requireRoom(event)
  // A batch of thirty phone photos arrives as thirty requests within a minute.
  await rateLimit(event, { name: 'room-upload', limit: 60, windowSeconds: 60, identifier: user.id })
  if (Number(getHeader(event, 'content-length') ?? 0) > FORM_BYTES_MAX) {
    throw createError({ statusCode: 413, message: 'That photo is too large.' })
  }
  const form = await readFormData(event).catch(() => null)
  const file = form?.get('file')
  const thumb = form?.get('thumb')
  const fields = fieldsSchema.safeParse({
    width: form?.get('width'),
    height: form?.get('height'),
    albumId: form?.get('albumId') || undefined,
  })
  if (!file || typeof file === 'string' || !thumb || typeof thumb === 'string' || !fields.success) {
    throw createError({ statusCode: 400, message: 'That is not a photo.' })
  }
  if (file.size > ROOM_PHOTO_BYTES_MAX || thumb.size > ROOM_THUMB_BYTES_MAX) {
    throw createError({ statusCode: 413, message: 'That photo is too large.' })
  }

  const result = await addRoomPhoto(
    db,
    roomStore,
    family,
    { id: user.id, name: user.name ?? null },
    {
      full: new Uint8Array(await file.arrayBuffer()),
      thumb: new Uint8Array(await thumb.arrayBuffer()),
      ...fields.data,
    },
    new Date(),
  )
  if (result.status === 'closed') {
    throw createError({ statusCode: 409, message: 'This family is closed. Nothing can be added.' })
  }
  if (result.status === 'full') {
    throw createError({ statusCode: 413, message: 'This family room is full.' })
  }
  if (result.status === 'no-album') {
    throw createError({ statusCode: 400, message: 'That album no longer exists.' })
  }
  if (result.status !== 'added') {
    throw createError({ statusCode: 400, message: 'That is not a photo.' })
  }
  setResponseStatus(event, 201)
  return result.photo
})
