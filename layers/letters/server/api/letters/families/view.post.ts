// POST /api/letters/families/view — one family as a member sees it.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { getFamily } from '../../../utils/families'

const bodySchema = z.object({ id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id } = await readValidatedBody(event, bodySchema.parse)
  const family = await getFamily(db, user.id, id, await postNow())
  if (!family) throw createError({ statusCode: 404, message: 'You are not in that family.' })
  return family
})
