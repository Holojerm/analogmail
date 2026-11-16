// GET /api/room — the family rooms the caller can open, closed families included.

import { db } from '@nuxthub/db'

import { roomFamiliesOf } from '../../utils/room-families'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return { rooms: await roomFamiliesOf(db, user.id) }
})
