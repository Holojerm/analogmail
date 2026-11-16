// POST /api/mantels/recover/act — a keeper cancels a use of the recovery code
// on their mantel (the claimant may also take theirs back), or the claimant
// finishes one whose wait is over.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { cancelRecovery, finishRecovery } from '../../../utils/recovery'

const bodySchema = z.object({ id: z.string().uuid(), action: z.enum(['cancel', 'finish']) })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id, action } = await readValidatedBody(event, bodySchema.parse)
  const now = await postNow()
  if (action === 'cancel') {
    if (!(await cancelRecovery(db, user.id, id, now))) {
      throw createError({ statusCode: 404, message: 'That is no longer waiting.' })
    }
    return { ok: true }
  }
  const result = await finishRecovery(db, user.id, id, now)
  if (result === 'not-ready') {
    throw createError({ statusCode: 409, message: 'The wait is not over yet.' })
  }
  if (result !== 'seated') {
    throw createError({ statusCode: 404, message: 'That is no longer waiting.' })
  }
  return { ok: true }
})
