// GET /api/letters/desk — the writer's drafts and sealed letters.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { listDesk } from '../../utils/posting'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return listDesk(db, user.id, await postNow())
})
