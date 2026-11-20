// POST /api/letters/drafts/discard — throw a draft away.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { discardDraft } from '../../../utils/drafts'
import { requireAuthor } from '../../../utils/mantel-author'
import { photoStore } from '../../../utils/photo-store'

const bodySchema = z.object({
  id: letterIdSchema,
  /** Writing as a child's mantel the caller keeps. */
  mantelId: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id, mantelId } = await readValidatedBody(event, bodySchema.parse)
  const author = await requireAuthor(db, user.id, mantelId)
  if (!(await discardDraft(db, author, id, photoStore))) {
    throw createError({
      statusCode: 404,
      message: 'That draft does not exist.',
    })
  }
  return { ok: true }
})
