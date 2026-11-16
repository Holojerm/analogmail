// POST /api/letters/guest/post — a guest's letter, already encrypted to the
// mantel's key. Works signed out, behind the bot check and two rate limits:
// one per sender, one per link, since the link is printed on a card.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'
import { requireTurnstile } from '#server/utils/turnstile'

import { guestLetterSchema } from '../../../../shared/utils/guest'
import { postGuestLetter } from '../../../utils/guest-letters'

export default defineEventHandler(async (event) => {
  await rateLimit(event, { name: 'guest-post', limit: 6, windowSeconds: 3600 })
  const body = await readValidatedBody(event, guestLetterSchema.parse)
  await rateLimit(event, {
    name: 'guest-post-link',
    limit: 120,
    windowSeconds: 3600,
    identifier: body.link,
  })
  await requireTurnstile(event, body.turnstileToken)

  const result = await postGuestLetter(db, body.link, body, await postNow())
  if (result.status === 'exists') {
    throw createError({ statusCode: 409, message: 'That letter was already sent.' })
  }
  if (result.status !== 'posted') {
    throw createError({ statusCode: 410, message: 'This link no longer takes letters.' })
  }
  return { opensOn: result.opensOn }
})
