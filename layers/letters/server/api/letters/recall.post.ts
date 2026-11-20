// POST /api/letters/recall — take a sealed letter back before it is collected.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { letterIdSchema } from '../../../shared/utils/letter-doc'
import { requireAuthor } from '../../utils/mantel-author'
import { recallLetter } from '../../utils/posting'

const bodySchema = z.object({
  id: letterIdSchema,
  /** Writing as a child's mantel the caller keeps. */
  mantelId: z.string().uuid().optional(),
})

const REFUSALS = {
  'not-yours': [404, 'That letter is not yours.'],
  'not-sealed': [409, 'That letter is not sealed.'],
  'too-late': [409, 'That letter has been collected. It can no longer be recalled.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id, mantelId } = await readValidatedBody(event, bodySchema.parse)
  const result = await recallLetter(
    db,
    await requireAuthor(db, user.id, mantelId),
    id,
    await postNow(),
  )
  if (result !== 'recalled') {
    const [statusCode, message] = REFUSALS[result]
    throw createError({ statusCode, message, data: { reason: result } })
  }
  return { ok: true }
})
