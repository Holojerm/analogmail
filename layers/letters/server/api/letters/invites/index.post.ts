// POST /api/letters/invites — invite someone by email. The answer carries the
// link once, so the sender can also pass it on themself.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'
import { sendEmail } from '#server/utils/email'
import { emailBranding } from '#server/utils/email-templates'

import { inviteInputSchema } from '../../../../shared/utils/invites'
import { inviteEmail, inviteLink } from '../../../utils/invite-email'
import { createInvite } from '../../../utils/invites'

const REFUSALS = {
  self: 'That is your own address.',
  'needs-name': 'Choose your name first.',
  'already-writing': 'You already write with this person.',
  pending: 'You have already invited this address.',
  'too-many': 'You have many invitations waiting. Withdraw one first.',
  'not-keeper': 'You do not keep that mantel.',
  'not-organiser': 'Only the organiser of a family invites people to it.',
  'family-full': 'This family has as many members as it can hold.',
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'letters-invite',
    limit: 10,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const { email, mantelId, familyId } = await readValidatedBody(event, inviteInputSchema.parse)

  const result = await createInvite(
    db,
    { id: user.id, email: user.email },
    email,
    await postNow(),
    mantelId ?? null,
    familyId ?? null,
  )
  if (result.status !== 'created') {
    throw createError({
      statusCode: result.status === 'needs-name' ? 409 : 400,
      message: REFUSALS[result.status],
      data: { reason: result.status },
    })
  }

  const brand = emailBranding()
  const sent = await sendEmail({ to: email, ...inviteEmail(brand, result) })
  return {
    link: inviteLink(brand.appUrl, result.token),
    expiresAt: result.expiresAt.toISOString(),
    emailed: sent.sent,
  }
})
