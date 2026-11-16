// GET /api/post/profile — the caller's own postal profile, or null before
// they have chosen a city.

import { db } from '@nuxthub/db'

import { getProfile } from '../../utils/profile'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return { profile: await getProfile(db, user.id) }
})
