// POST /api/letters/news/readers — who reads a child's news and who has been
// asked, and the correspondence its keepers write it in. Keepers only: a
// reader is never told who else reads.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { listNewsReaders } from '../../../utils/news'

const bodySchema = z.object({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId } = await readValidatedBody(event, bodySchema.parse)
  const news = await listNewsReaders(db, user.id, mantelId, await postNow())
  if (!news) throw createError({ statusCode: 404, message: 'You do not keep that mantel.' })
  return news
})
