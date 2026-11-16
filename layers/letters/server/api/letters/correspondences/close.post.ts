// POST /api/letters/correspondences/close — stop writing with someone.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { closeCorrespondence } from '../../../utils/closing'

const bodySchema = z.object({ id: z.string().min(1).max(64) })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id } = await readValidatedBody(event, bodySchema.parse)
  const result = await closeCorrespondence(db, user.id, id, await postNow())
  if (result === 'not-yours') {
    throw createError({ statusCode: 404, message: 'You do not write with this person.' })
  }
  return { ok: true }
})
