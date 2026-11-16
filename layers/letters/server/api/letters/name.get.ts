// GET /api/letters/name — the display name the person chose, or null.

import { db } from '@nuxthub/db'

import { getDisplayName } from '../../utils/people'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return { name: await getDisplayName(db, user.id) }
})
