// POST /api/letters/kept/remove — a keeper takes a guest's letter off the
// mantel for good, once its day has come.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { removeGuestLetter } from '../../../utils/guest-letters'
import { photoStore } from '../../../utils/photo-store'

const bodySchema = z.object({ mantelId: z.string().uuid(), letterId: letterIdSchema })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId, letterId } = await readValidatedBody(event, bodySchema.parse)
  const result = await removeGuestLetter(
    db,
    photoStore,
    user.id,
    mantelId,
    letterId,
    await postNow(),
  )
  if (result === 'sealed') {
    throw createError({
      statusCode: 409,
      message: 'This letter is still sealed. It can be removed once it has opened.',
    })
  }
  if (result !== 'removed') {
    throw createError({ statusCode: 404, message: 'That letter is not on this mantel.' })
  }
  return { ok: true }
})
