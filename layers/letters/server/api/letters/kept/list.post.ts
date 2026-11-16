// POST /api/letters/kept/list — a kept mantel's post and what has arrived on
// it, for one of its keepers. A sealed letter is listed with its opening day
// and nothing else.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'
import { getProfile } from '#layers/post/server/utils/profile'

import { listKeptMantel } from '../../../utils/kept-mantel'

const bodySchema = z.object({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId } = await readValidatedBody(event, bodySchema.parse)
  const letters = await listKeptMantel(db, user.id, mantelId, await postNow())
  if (!letters) throw createError({ statusCode: 404, message: 'You do not keep that mantel.' })
  const profile = await getProfile(db, mantelId)
  return {
    post: profile ? { city: profile.cityName, country: profile.country } : null,
    letters,
  }
})
