// GET /api/mantels — the mantels the caller keeps, and seats offered to them.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { offersFor } from '../../utils/custody'
import { listMantels } from '../../utils/mantels'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return {
    mantels: await listMantels(db, user.id),
    offers: await offersFor(db, user.id, await postNow()),
  }
})
