// GET /api/room/<family>/photos/<id>/image?size=thumb|full — the picture,
// after the membership check. Never cached anywhere shared.

import { blob } from '@nuxthub/blob'
import { db } from '@nuxthub/db'
import { z } from 'zod'

import { requireRoom } from '../../../../../utils/room-access'
import { findRoomPhoto } from '../../../../../utils/room-photos'

const paramsSchema = z.object({ id: z.string().uuid() })
const querySchema = z.object({ size: z.enum(['thumb', 'full']).default('full') })

export default defineEventHandler(async (event) => {
  const { family } = await requireRoom(event)
  const params = paramsSchema.safeParse({ id: getRouterParam(event, 'id') })
  const query = querySchema.safeParse(getQuery(event))
  const photo =
    params.success && query.success ? await findRoomPhoto(db, family.id, params.data.id) : null
  if (!photo || !query.success) {
    throw createError({ statusCode: 404, message: 'That photo is not in this room.' })
  }
  // A photo never changes under its id; `private` because every byte passed a check.
  setHeader(event, 'Cache-Control', 'private, max-age=86400')
  return blob.serve(event, query.data.size === 'thumb' ? photo.thumbKey : photo.storageKey)
})
