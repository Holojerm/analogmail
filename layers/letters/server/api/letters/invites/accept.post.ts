// POST /api/letters/invites/accept — accept an invitation. This is the consent.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { acceptInvite } from '../../../utils/accept-invite'

const bodySchema = z.object({ token: z.string().min(20).max(100) })

const REFUSALS = {
  unknown: [404, 'This invitation does not exist.'],
  expired: [410, 'This invitation has expired.'],
  used: [410, 'This invitation has already been accepted.'],
  own: [400, 'This is your own invitation.'],
  'needs-name': [409, 'Choose your name first.'],
  'needs-city': [409, 'Choose your city first.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'letters-accept',
    limit: 20,
    windowSeconds: 60,
    identifier: user.id,
  })
  const { token } = await readValidatedBody(event, bodySchema.parse)

  const result = await acceptInvite(db, token, user.id, await postNow())
  if (result.status !== 'accepted') {
    const [statusCode, message] = REFUSALS[result.status]
    throw createError({ statusCode, message, data: { reason: result.status } })
  }
  return { correspondenceId: result.correspondenceId }
})
