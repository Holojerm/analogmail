// POST /api/letters/families — start a family. The caller is its organiser.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { createFamily } from '../../../utils/families'

const bodySchema = z.object({ name: z.string().max(80) })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'families-create',
    limit: 10,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const { name } = await readValidatedBody(event, bodySchema.parse)
  const result = await createFamily(db, user.id, name, await postNow())
  if (result.status !== 'created') {
    throw result.status === 'needs-name'
      ? createError({ statusCode: 409, message: 'Choose your own name first.' })
      : createError({
          statusCode: 400,
          message: 'Use letters, spaces and simple punctuation for the family name.',
        })
  }
  return { id: result.id }
})
