// GET /api/letters/news — the children whose news the caller reads. Never the
// other readers.

import { db } from '@nuxthub/db'

import { listNewsFor } from '../../../utils/news'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return { news: await listNewsFor(db, user.id) }
})
