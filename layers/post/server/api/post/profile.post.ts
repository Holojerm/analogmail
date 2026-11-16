// POST /api/post/profile — choose a city, mail days and a delivery hour, once,
// at sign-up.

import { db } from '@nuxthub/db'

import { postNow } from '../../utils/clock'
import { createProfile, getProfile, profileInputSchema } from '../../utils/profile'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, { name: 'profile', limit: 10, windowSeconds: 60, identifier: user.id })
  const body = await readValidatedBody(event, profileInputSchema.parse)
  const result = await createProfile(db, user.id, body, await postNow())
  if (result === 'unknown-city') throw createError({ statusCode: 400, message: 'Unknown city' })
  if (result === 'exists') {
    throw createError({ statusCode: 409, message: 'You have already chosen your city' })
  }
  return { profile: await getProfile(db, user.id) }
})
