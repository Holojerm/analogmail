// GET /api/room/<family>/photos — a page of the family's photos, newest first.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { requireRoom } from '../../../../utils/room-access'
import { listRoomPhotos } from '../../../../utils/room-photos'

const querySchema = z.object({
  album: z.union([z.literal('none'), z.string().uuid()]).optional(),
  cursor: z.string().max(64).optional(),
})

export default defineEventHandler(async (event) => {
  const { family } = await requireRoom(event)
  return listRoomPhotos(db, family.id, await getValidatedQuery(event, querySchema.parse))
})
