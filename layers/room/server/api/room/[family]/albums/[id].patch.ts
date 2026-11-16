// PATCH /api/room/<family>/albums/<id> — rename an album.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { ROOM_ALBUM_NAME_MAX } from '../../../../../shared/utils/room-types'
import { refuseRoomChange, requireRoom } from '../../../../utils/room-access'
import { renameRoomAlbum } from '../../../../utils/room-photos'

const idSchema = z.string().uuid()
const bodySchema = z.object({ name: z.string().trim().min(1).max(ROOM_ALBUM_NAME_MAX) })

export default defineEventHandler(async (event) => {
  const { user, family } = await requireRoom(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  const { name } = await readValidatedBody(event, bodySchema.parse)
  const result = id.success
    ? await renameRoomAlbum(db, family, user.id, id.data, name)
    : 'not-found'
  if (result !== 'done') throw refuseRoomChange(result, 'album')
  return { ok: true }
})
