// POST /api/letters/invites/withdraw — take back an invitation nobody accepted.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { withdrawInvite } from '../../../utils/invites'

const bodySchema = z.object({ id: z.string().min(1).max(64) })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id } = await readValidatedBody(event, bodySchema.parse)
  if (!(await withdrawInvite(db, user.id, id))) {
    throw createError({ statusCode: 404, message: 'That invitation is not waiting.' })
  }
  return { ok: true }
})
