// POST /api/letters/invites/accept — accept an invitation. This is the consent.
// By its link (`token`), or, for the person it was sent to, by its `id`.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import type { AcceptedInvite } from '../../../../shared/utils/invites'
import { acceptInvite, acceptInviteSentTo } from '../../../utils/accept-invite'

const bodySchema = z.union([
  z.object({ token: z.string().min(20).max(100) }),
  z.object({ id: z.string().uuid() }),
])

const REFUSALS = {
  unknown: [404, 'This invitation does not exist.'],
  expired: [410, 'This invitation has expired.'],
  used: [410, 'This invitation has already been accepted.'],
  own: [400, 'This is your own invitation.'],
  'needs-name': [409, 'Choose your name first.'],
  'needs-city': [409, 'Choose your city first.'],
} as const

export default defineEventHandler(async (event): Promise<AcceptedInvite> => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'letters-accept',
    limit: 20,
    windowSeconds: 60,
    identifier: user.id,
  })
  const body = await readValidatedBody(event, bodySchema.parse)

  const now = await postNow()
  const result =
    'token' in body
      ? await acceptInvite(db, body.token, user.id, now)
      : await acceptInviteSentTo(db, body.id, user, now)
  if (result.status !== 'accepted') {
    const [statusCode, message] = REFUSALS[result.status]
    throw createError({ statusCode, message, data: { reason: result.status } })
  }
  return {
    correspondenceId: result.correspondenceId,
    kind: result.kind,
    familyId: result.familyId,
  }
})
