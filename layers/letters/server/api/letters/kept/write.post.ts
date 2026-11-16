// POST /api/letters/kept/write — the correspondence the caller writes to a
// mantel they keep in, made on first use.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { openMantelCorrespondence } from '../../../utils/correspondences'

const bodySchema = z.object({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId } = await readValidatedBody(event, bodySchema.parse)
  const correspondenceId = await openMantelCorrespondence(db, user.id, mantelId, await postNow())
  if (!correspondenceId) {
    throw createError({ statusCode: 404, message: 'You do not keep that mantel.' })
  }
  return { correspondenceId }
})
