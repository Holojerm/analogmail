// DELETE /api/room/<family>/albums/<id> — the album goes, its photos stay.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { refuseRoomChange, requireRoom } from '../../../../utils/room-access'
import { deleteRoomAlbum } from '../../../../utils/room-photos'

const idSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const { user, family } = await requireRoom(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  const result = id.success ? await deleteRoomAlbum(db, family, user.id, id.data) : 'not-found'
  if (result !== 'done') throw refuseRoomChange(result, 'album')
  setResponseStatus(event, 204)
  return null
})
