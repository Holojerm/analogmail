// POST /api/room/<family>/checkins/forget — take back everything you have
// said to this family about where you were.

import { db } from '@nuxthub/db'

import { requireRoom } from '../../../../utils/room-access'
import { forgetCheckins } from '../../../../utils/room-checkins'

export default defineEventHandler(async (event) => {
  const { user, family } = await requireRoom(event)
  await forgetCheckins(db, family.id, user.id)
  return { ok: true }
})
