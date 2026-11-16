// DELETE /api/room/<family>/photos/<id> — remove a photo and its files.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { refuseRoomChange, requireRoom } from '../../../../../utils/room-access'
import { deleteRoomPhoto } from '../../../../../utils/room-photos'
import { roomStore } from '../../../../../utils/room-store'

const idSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const { user, family } = await requireRoom(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  const result = id.success
    ? await deleteRoomPhoto(db, roomStore, family, user.id, id.data)
    : 'not-found'
  if (result !== 'done') throw refuseRoomChange(result, 'photo')
  setResponseStatus(event, 204)
  return null
})
