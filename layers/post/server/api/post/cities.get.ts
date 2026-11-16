// GET /api/post/cities?q= — the list a person picks their city from.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { searchCities } from '../../utils/profile'

const querySchema = z.object({ q: z.string().max(80).default('') })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, { name: 'cities', limit: 120, windowSeconds: 60, identifier: user.id })
  const { q } = await getValidatedQuery(event, querySchema.parse)
  return { cities: await searchCities(db, q) }
})
