// POST /api/letters/kept/archive — what a keeper may copy from a kept mantel:
// the letters that have been opened on it, with how many were left out.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { listKeptArchive } from '../../../utils/kept-archive'

const bodySchema = z.object({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId } = await readValidatedBody(event, bodySchema.parse)
  const archive = await listKeptArchive(db, user.id, mantelId, await postNow())
  if (!archive) throw createError({ statusCode: 404, message: 'You do not keep that mantel.' })
  return archive
})
