// POST /api/letters/families/close — the organiser closes a family for
// everyone. Letters still on their way go back to their senders.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { closeFamily } from '../../../utils/families'

const bodySchema = z.object({ familyId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { familyId } = await readValidatedBody(event, bodySchema.parse)
  if ((await closeFamily(db, user.id, familyId, await postNow())) !== 'done') {
    throw createError({ statusCode: 403, message: 'Only the organiser closes the family.' })
  }
  return { ok: true }
})
