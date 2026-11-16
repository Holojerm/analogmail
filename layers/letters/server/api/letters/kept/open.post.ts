// POST /api/letters/kept/open — open a letter on a kept mantel. Before its
// opening day this returns that day and nothing of the letter.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { openKeptLetter } from '../../../utils/kept-mantel'

const bodySchema = z.object({ mantelId: z.string().uuid(), letterId: letterIdSchema })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId, letterId } = await readValidatedBody(event, bodySchema.parse)
  const letter = await openKeptLetter(db, user.id, mantelId, letterId, await postNow())
  if (!letter) throw createError({ statusCode: 404, message: 'That letter is not on this mantel.' })
  return letter
})
