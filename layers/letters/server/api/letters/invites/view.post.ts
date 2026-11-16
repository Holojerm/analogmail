// POST /api/letters/invites/view — what the holder of a link may know about
// it. Public; the token travels in the body so it stays out of request logs.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { viewInvite } from '../../../utils/invites'

const inviteTokenSchema = z.object({ token: z.string().min(20).max(100) })

export default defineEventHandler(async (event) => {
  await rateLimit(event, { name: 'letters-invite-view', limit: 30, windowSeconds: 60 })
  const { token } = await readValidatedBody(event, inviteTokenSchema.parse)
  return viewInvite(db, token, await postNow())
})
