// POST /api/room/<family>/checkins — say which city you are in, to this family.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { requireRoom } from '../../../../utils/room-access'
import { checkIn } from '../../../../utils/room-checkins'

const bodySchema = z.object({ cityId: z.number().int().positive() })

export default defineEventHandler(async (event) => {
  const { user, family } = await requireRoom(event)
  await rateLimit(event, {
    name: 'room-checkin',
    limit: 30,
    windowSeconds: 60,
    identifier: user.id,
  })
  const { cityId } = await readValidatedBody(event, bodySchema.parse)
  const result = await checkIn(db, family, user.id, cityId, new Date())
  if (result === 'closed') {
    throw createError({ statusCode: 409, message: 'This family is closed. Nothing can be added.' })
  }
  if (result === 'unknown-city') {
    throw createError({ statusCode: 400, message: 'Pick a city from the list.' })
  }
  setResponseStatus(event, 201)
  return { ok: true }
})
