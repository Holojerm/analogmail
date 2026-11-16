// PATCH /api/room/<family>/photos/<id> — caption a photo or move it to an album.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { ROOM_CAPTION_MAX } from '../../../../../../shared/utils/room-types'
import { refuseRoomChange, requireRoom } from '../../../../../utils/room-access'
import { updateRoomPhoto } from '../../../../../utils/room-photos'

const idSchema = z.string().uuid()
const bodySchema = z
  .object({
    caption: z.string().trim().max(ROOM_CAPTION_MAX).nullable().optional(),
    albumId: z.string().uuid().nullable().optional(),
  })
  .refine((body) => body.caption !== undefined || body.albumId !== undefined, 'Nothing to change')

export default defineEventHandler(async (event) => {
  const { user, family } = await requireRoom(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  const body = await readValidatedBody(event, bodySchema.parse)
  const result = id.success
    ? await updateRoomPhoto(db, family, user.id, id.data, body)
    : 'not-found'
  if (result !== 'done') throw refuseRoomChange(result, 'photo')
  return { ok: true }
})
