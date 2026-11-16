// GET /api/letters/archive — what the caller can keep a copy of, by
// correspondence: the letters they sealed and the ones they have opened.

import { db } from '@nuxthub/db'

import { listArchive } from '../../../utils/archive'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return { shelves: await listArchive(db, user.id) }
})
