// POST /api/mantels/rekey/settle — after a re-key, a keeper's browser has
// opened the new key that was left for it and hands in an ordinary copy,
// wrapped to their own account.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { settleHandover, settleHandoverSchema } from '../../../utils/rekey'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'mantel-rekey-settle',
    limit: 30,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const body = await readValidatedBody(event, settleHandoverSchema.parse)
  if ((await settleHandover(db, user.id, body, await postNow())) !== 'settled') {
    throw createError({ statusCode: 409, message: 'There is no new key waiting for you.' })
  }
  return { ok: true }
})
