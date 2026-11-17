// POST /api/letters/news/leave — a reader stops getting a child's news.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { leaveNews } from '../../../utils/news'

const bodySchema = z.object({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId } = await readValidatedBody(event, bodySchema.parse)
  const result = await leaveNews(db, user.id, mantelId, await postNow())
  if (result !== 'done') {
    throw createError({
      statusCode: 409,
      message:
        result === 'is-keeper'
          ? 'You keep this mantel, so its news comes to you.'
          : 'You do not get this news.',
      data: { reason: result },
    })
  }
  return { left: true }
})
