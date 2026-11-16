// PUT /api/letters/kept/post — give a kept mantel its post: the city its
// letters travel to and the days they arrive. Set once, by a keeper.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { isKeeper } from '#layers/keys/server/utils/mantels'
import { postNow } from '#layers/post/server/utils/clock'
import { createProfile, profileInputSchema } from '#layers/post/server/utils/profile'

const bodySchema = profileInputSchema.extend({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId, ...profile } = await readValidatedBody(event, bodySchema.parse)
  if (!(await isKeeper(db, user.id, mantelId))) {
    throw createError({ statusCode: 404, message: 'You do not keep that mantel.' })
  }
  // The mantel takes delivery under its own id, as a person does under theirs.
  const result = await createProfile(db, mantelId, profile, await postNow())
  if (result === 'unknown-city') {
    throw createError({ statusCode: 400, message: 'Pick a city from the list.' })
  }
  if (result === 'exists') {
    throw createError({ statusCode: 409, message: 'This mantel already has its post.' })
  }
  return { ok: true }
})
