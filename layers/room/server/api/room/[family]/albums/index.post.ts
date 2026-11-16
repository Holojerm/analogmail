// POST /api/room/<family>/albums — start an album. Any member may.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { ROOM_ALBUM_NAME_MAX } from '../../../../../shared/utils/room-types'
import { requireRoom } from '../../../../utils/room-access'
import { createRoomAlbum } from '../../../../utils/room-photos'

const bodySchema = z.object({ name: z.string().trim().min(1).max(ROOM_ALBUM_NAME_MAX) })

export default defineEventHandler(async (event) => {
  const { user, family } = await requireRoom(event)
  const { name } = await readValidatedBody(event, bodySchema.parse)
  const album = await createRoomAlbum(db, family, user.id, name, new Date())
  if (album === 'closed') {
    throw createError({ statusCode: 409, message: 'This family is closed. Nothing can be added.' })
  }
  setResponseStatus(event, 201)
  return album
})
