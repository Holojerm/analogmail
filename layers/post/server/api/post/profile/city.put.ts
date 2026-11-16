// PUT /api/post/profile/city — move to another city. The time zone changes at once.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '../../../utils/clock'
import { getProfile } from '../../../utils/profile'
import { moveToCity } from '../../../utils/profile-settings'

const bodySchema = z.object({ cityId: z.number().int().positive() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, { name: 'profile', limit: 10, windowSeconds: 60, identifier: user.id })
  const { cityId } = await readValidatedBody(event, bodySchema.parse)
  const result = await moveToCity(db, user.id, cityId, await postNow())
  if (result === 'unknown-city') throw createError({ statusCode: 400, message: 'Unknown city' })
  if (result === 'no-profile') {
    throw createError({ statusCode: 409, message: 'Choose your city first.' })
  }
  return { profile: await getProfile(db, user.id) }
})
