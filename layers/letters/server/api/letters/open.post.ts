// POST /api/letters/open — open a letter that has arrived on the caller's mantel.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { letterIdSchema } from '../../../shared/utils/letter-doc'
import { openLetter } from '../../utils/mantel'

const bodySchema = z.object({ id: letterIdSchema })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id } = await readValidatedBody(event, bodySchema.parse)
  const letter = await openLetter(db, user.id, id, await postNow())
  if (!letter) throw createError({ statusCode: 404, message: 'That letter is not on your mantel.' })
  return letter
})
