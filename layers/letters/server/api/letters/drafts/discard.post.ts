// POST /api/letters/drafts/discard — throw a draft away.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { discardDraft } from '../../../utils/drafts'
import { photoStore } from '../../../utils/photo-store'

const bodySchema = z.object({ id: letterIdSchema })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id } = await readValidatedBody(event, bodySchema.parse)
  if (!(await discardDraft(db, user.id, id, photoStore))) {
    throw createError({
      statusCode: 404,
      message: 'That draft does not exist.',
    })
  }
  return { ok: true }
})
