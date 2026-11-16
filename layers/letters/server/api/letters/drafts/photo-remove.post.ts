// POST /api/letters/drafts/photo-remove — take the photo off a draft.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { photoStore } from '../../../utils/photo-store'
import { detachPhoto } from '../../../utils/photos'

const bodySchema = z.object({ id: letterIdSchema })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id } = await readValidatedBody(event, bodySchema.parse)
  const result = await detachPhoto(db, photoStore, user.id, id, await postNow())
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
