// POST /api/letters/news/remove — a keeper stops someone reading a child's news.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { removeNewsReader } from '../../../utils/news'

const bodySchema = z.object({ mantelId: z.string().uuid(), readerId: z.string().min(1).max(64) })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId, readerId } = await readValidatedBody(event, bodySchema.parse)
  const result = await removeNewsReader(db, user.id, mantelId, readerId, await postNow())
  if (result !== 'done') {
    throw createError({
      statusCode: result === 'not-keeper' ? 404 : 409,
      message:
        result === 'not-keeper' ? 'You do not keep that mantel.' : 'They do not read this news.',
      data: { reason: result },
    })
  }
  return { removed: true }
})
