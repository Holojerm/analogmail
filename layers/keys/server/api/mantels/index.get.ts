// GET /api/mantels — the mantels the caller keeps, seats offered to them, and
// their own uses of a recovery code that are still waiting.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { offersFor } from '../../utils/custody'
import { listMantels } from '../../utils/mantels'
import { myRecoveries } from '../../utils/recovery'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const now = await postNow()
  return {
    mantels: await listMantels(db, user.id),
    offers: await offersFor(db, user.id, now),
    recoveries: await myRecoveries(db, user.id, now),
  }
})
