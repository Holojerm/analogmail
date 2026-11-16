// POST /api/letters/families/leave — a member leaves a family, or its
// organiser removes one. The family goes on without them.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { leaveFamily } from '../../../utils/families'

const bodySchema = z.object({
  familyId: z.string().uuid(),
  /** Omitted to leave oneself. */
  memberId: z.string().min(1).max(64).optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { familyId, memberId } = await readValidatedBody(event, bodySchema.parse)
  const result = await leaveFamily(db, user.id, familyId, memberId ?? user.id, await postNow())
  if (result === 'not-organiser') {
    throw createError({ statusCode: 403, message: 'Only the organiser removes someone else.' })
  }
  if (result !== 'left') {
    throw createError({ statusCode: 404, message: 'They are not in that family.' })
  }
  return { ok: true }
})
