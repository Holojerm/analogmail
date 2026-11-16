// GET /api/room/<family>/whereabouts — where each person in the family last
// said they were.

import { db } from '@nuxthub/db'

import { requireRoom } from '../../../utils/room-access'
import { whereabouts } from '../../../utils/room-checkins'

export default defineEventHandler(async (event) => {
  const { user, family } = await requireRoom(event)
  return { family, me: user.id, people: await whereabouts(db, family.id) }
})
