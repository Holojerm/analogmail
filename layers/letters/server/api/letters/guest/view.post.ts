// POST /api/letters/guest/view — what a write link's holder may know: whose
// mantel it is, its public key (which their browser checks against the
// link), and when the letters open. Works signed out. The holder shows the
// secret from the link's fragment; without it the answer is "unknown".

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { guestLinkHolderSchema } from '../../../../shared/utils/guest'
import { viewGuestLink } from '../../../utils/guest-letters'

export default defineEventHandler(async (event) => {
  await rateLimit(event, { name: 'guest-view', limit: 60, windowSeconds: 600 })
  const body = await readValidatedBody(event, guestLinkHolderSchema.safeParse)
  if (!body.success) return { status: 'unknown' as const }
  return viewGuestLink(db, body.data, await postNow())
})
