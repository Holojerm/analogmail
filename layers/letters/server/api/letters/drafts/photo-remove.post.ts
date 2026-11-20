// POST /api/letters/drafts/photo-remove — take the photo off a draft.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { requireAuthor } from '../../../utils/mantel-author'
import { photoStore } from '../../../utils/photo-store'
import { detachPhoto } from '../../../utils/photos'

const bodySchema = z.object({
  id: letterIdSchema,
  /** Writing as a child's mantel the caller keeps. */
  mantelId: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id, mantelId } = await readValidatedBody(event, bodySchema.parse)
  const author = await requireAuthor(db, user.id, mantelId)
  const result = await detachPhoto(db, photoStore, author, id, await postNow())
  if (result === 'not-yours') {
    throw createError({
      statusCode: 404,
      message: 'That letter is not yours.',
    })
  }
  if (result === 'sealed') {
    throw createError({
      statusCode: 409,
      message: 'That letter is sealed. Recall it to change it.',
    })
  }
  return { ok: true }
})
