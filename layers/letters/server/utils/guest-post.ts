// What both guest routes do once they have read the letter: the per-link
// limit, the bot check, and the letter itself.

import { db } from '@nuxthub/db'
import type { H3Event } from 'h3'

import { postNow } from '#layers/post/server/utils/clock'
import { requireTurnstile } from '#server/utils/turnstile'

import type { GuestLetter } from '../../shared/utils/guest'
import { postGuestLetter } from './guest-letters'
import { photoStore } from './photo-store'

export async function takeGuestLetter(
  event: H3Event,
  body: GuestLetter,
  photo?: { id: string; bytes: Uint8Array },
) {
  await rateLimit(event, {
    name: 'guest-post-link',
    limit: 120,
    windowSeconds: 3600,
    identifier: body.link,
  })
  await requireTurnstile(event, body.turnstileToken)

  const result = await postGuestLetter(
    db,
    body.link,
    body,
    await postNow(),
    photo ? { store: photoStore, ...photo } : undefined,
  )
  if (result.status === 'exists') {
    throw createError({ statusCode: 409, message: 'That letter was already sent.' })
  }
  if (result.status !== 'posted') {
    throw createError({ statusCode: 410, message: 'This link no longer takes letters.' })
  }
  return { opensOn: result.opensOn }
}
