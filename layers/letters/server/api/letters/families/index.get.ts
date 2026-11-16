// GET /api/letters/families — the families the caller is in.

import { db } from '@nuxthub/db'

import { listFamilies } from '../../../utils/families'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return { families: await listFamilies(db, user.id) }
})
