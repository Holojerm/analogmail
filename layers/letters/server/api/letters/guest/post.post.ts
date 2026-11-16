// POST /api/letters/guest/post — a guest's letter, already encrypted to the
// mantel's key. Works signed out, behind the bot check and two rate limits:
// one per sender, one per link, since the link is printed on a card.

import { guestLetterSchema } from '../../../../shared/utils/guest'
import { takeGuestLetter } from '../../../utils/guest-post'

export default defineEventHandler(async (event) => {
  await rateLimit(event, { name: 'guest-post', limit: 6, windowSeconds: 3600 })
  const body = await readValidatedBody(event, guestLetterSchema.parse)
  return takeGuestLetter(event, body)
})
