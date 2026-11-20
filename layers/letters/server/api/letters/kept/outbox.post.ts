// POST /api/letters/kept/outbox — for a keeper of a child's mantel: who the
// mantel can write to, and its drafts and sealed letters as any sender sees
// them.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { mantelOutbox } from '../../../utils/mantel-author'

const bodySchema = z.object({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId } = await readValidatedBody(event, bodySchema.parse)
  const outbox = await mantelOutbox(db, user.id, mantelId, await postNow())
  if (!outbox) throw createError({ statusCode: 404, message: 'You do not keep that mantel.' })
  return outbox
})
