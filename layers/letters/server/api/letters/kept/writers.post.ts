// POST /api/letters/kept/writers — a keeper stops a writer, or takes back an
// invitation to write that nobody has accepted.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { stopWriter, withdrawWriterInvite } from '../../../utils/kept-mantel'

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('stop'),
    mantelId: z.string().uuid(),
    writerId: z.string().min(1).max(64),
  }),
  z.object({
    action: z.literal('withdraw'),
    mantelId: z.string().uuid(),
    inviteId: z.string().min(1).max(64),
  }),
])

const REFUSALS = {
  'not-keeper': [404, 'You do not keep that mantel.'],
  'not-a-writer': [409, 'They do not write to this mantel.'],
  'is-keeper': [409, 'A keeper cannot be stopped this way. Propose their removal instead.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  if (body.action === 'withdraw') {
    if (!(await withdrawWriterInvite(db, user.id, body.mantelId, body.inviteId))) {
      throw createError({ statusCode: 404, message: 'That invitation is no longer waiting.' })
    }
    return { ok: true }
  }
  const result = await stopWriter(db, user.id, body.mantelId, body.writerId, await postNow())
  if (result !== 'stopped') {
    const [statusCode, message] = REFUSALS[result]
    throw createError({ statusCode, message, data: { reason: result } })
  }
  return { ok: true }
})
