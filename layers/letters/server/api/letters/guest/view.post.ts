// POST /api/letters/guest/view — what a write link's holder may know: whose
// mantel it is, its public key (which their browser checks against the
// link), and when the letters open. Works signed out.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { guestLinkIdSchema } from '../../../../shared/utils/guest'
import { viewGuestLink } from '../../../utils/guest-letters'

const bodySchema = z.object({ link: guestLinkIdSchema })

export default defineEventHandler(async (event) => {
  await rateLimit(event, { name: 'guest-view', limit: 60, windowSeconds: 600 })
  const body = await readValidatedBody(event, bodySchema.safeParse)
  if (!body.success) return { status: 'unknown' as const }
  return viewGuestLink(db, body.data.link, await postNow())
})
