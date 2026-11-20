// PUT /api/letters/kept/openings — any keeper sets how letters to the mantel
// may open: on arrival, sealed until one of the days listed, or both.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { openingsSchema } from '../../../../shared/utils/openings'
import { setMantelOpenings } from '../../../utils/openings'

const bodySchema = openingsSchema.extend({ mantelId: z.string().uuid() })

const REFUSALS = {
  'not-keeper': [404, 'You do not keep that mantel.'],
  'no-choice': [400, 'Leave at least one way for a letter to open.'],
  'bad-day': [400, 'Each day has to be after today, and within a hundred years.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, { name: 'profile', limit: 10, windowSeconds: 60, identifier: user.id })
  const { mantelId, ...openings } = await readValidatedBody(event, bodySchema.parse)
  const result = await setMantelOpenings(db, user.id, mantelId, openings, await postNow())
  if (result !== 'changed') {
    const [statusCode, message] = REFUSALS[result]
    throw createError({ statusCode, message, data: { reason: result } })
  }
  return { ok: true }
})
