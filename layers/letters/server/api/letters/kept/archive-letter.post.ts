// POST /api/letters/kept/archive-letter — the encrypted parts of one opened
// letter on a kept mantel, for a keeper's copy. It opens nothing.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { readKeptForArchive } from '../../../utils/kept-archive'

const bodySchema = z.object({ mantelId: z.string().uuid(), letterId: letterIdSchema })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId, letterId } = await readValidatedBody(event, bodySchema.parse)
  const sealed = await readKeptForArchive(db, user.id, mantelId, letterId, await postNow())
  if (!sealed) throw createError({ statusCode: 404, message: 'That letter is not yours to copy.' })
  return sealed
})
