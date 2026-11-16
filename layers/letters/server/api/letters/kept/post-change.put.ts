// PUT /api/letters/kept/post-change — a keeper moves a kept mantel to another
// city (at once) or changes its mail days and hour (from tomorrow).

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'
import { mailSettingsSchema } from '#layers/post/server/utils/profile-settings'

import { changeMantelPost } from '../../../utils/kept-mantel'

const mantelId = z.string().uuid()
const bodySchema = z.union([
  z.object({ mantelId, cityId: z.number().int().positive() }),
  mailSettingsSchema.extend({ mantelId }),
])

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, { name: 'profile', limit: 10, windowSeconds: 60, identifier: user.id })
  const { mantelId: id, ...change } = await readValidatedBody(event, bodySchema.parse)
  const result = await changeMantelPost(db, user.id, id, change, await postNow())
  if (result === 'not-keeper') {
    throw createError({ statusCode: 404, message: 'You do not keep that mantel.' })
  }
  if (result === 'unknown-city') {
    throw createError({ statusCode: 400, message: 'Pick a city from the list.' })
  }
  if (result === 'no-post') {
    throw createError({ statusCode: 409, message: "Choose the mantel's city first." })
  }
  return { ok: true }
})
