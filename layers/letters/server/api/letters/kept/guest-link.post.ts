// POST /api/letters/kept/guest-link — make an anniversary mantel's write
// link, replacing the one it had.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { newGuestLinkSchema } from '../../../../shared/utils/guest'
import { createGuestLink } from '../../../utils/guest-letters'

const REFUSALS = {
  'not-keeper': [404, 'You do not keep that mantel.'],
  'not-anniversary': [409, 'Only an anniversary mantel has a write link.'],
  'needs-post': [409, "Choose the mantel's city first."],
  'bad-dates': [400, 'Writing must close today or later, and the letters must open after that.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'guest-link',
    limit: 10,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const body = await readValidatedBody(event, newGuestLinkSchema.parse)
  const result = await createGuestLink(db, user.id, body, await postNow())
  if (result.status !== 'created') {
    const [statusCode, message] = REFUSALS[result.status]
    throw createError({ statusCode, message, data: { reason: result.status } })
  }
  return { id: result.id }
})
