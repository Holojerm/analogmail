// POST /api/mantels/proposals/act — vote for a proposal, accept an offered
// seat, or withdraw (the proposer) or decline (the person offered).

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { acceptSeat, voteForProposal, withdrawProposal } from '../../../utils/custody'

const bodySchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['vote', 'accept', 'withdraw']),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id, action } = await readValidatedBody(event, bodySchema.parse)
  const now = await postNow()
  const gone = () => createError({ statusCode: 404, message: 'That is no longer open.' })

  if (action === 'vote') {
    if ((await voteForProposal(db, user.id, id, now)) !== 'voted') throw gone()
  } else if (action === 'accept') {
    const result = await acceptSeat(db, user.id, id, now)
    if (result === 'no-keys') {
      throw createError({ statusCode: 409, message: 'Set up your own keys first.' })
    }
    if (result !== 'accepted') throw gone()
  } else if (!(await withdrawProposal(db, user.id, id, now))) {
    throw gone()
  }
  return { ok: true }
})
