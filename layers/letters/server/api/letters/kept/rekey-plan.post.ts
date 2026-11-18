// POST /api/letters/kept/rekey-plan — what a keeper's browser needs to change
// a mantel's key after another keeper has left: the key it should be holding,
// the keepers to hand the new one to, and every letter key to wrap again.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { mantelRekeyPlan } from '../../../utils/kept-rekey'

const bodySchema = z.object({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'mantel-rekey',
    limit: 20,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const { mantelId } = await readValidatedBody(event, bodySchema.parse)
  const plan = await mantelRekeyPlan(db, user.id, mantelId)
  if (!plan) {
    throw createError({ statusCode: 409, message: "This mantel's key does not need changing." })
  }
  return plan
})
