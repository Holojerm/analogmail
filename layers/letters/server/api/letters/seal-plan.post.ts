// POST /api/letters/seal-plan — what sealing would mean now: who reads the
// letter, the public key to wrap its key to, and when it would be collected
// and arrive.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { planSeal } from '../../utils/posting'

const bodySchema = z.object({ correspondenceId: z.string().min(1).max(64) })

const POSTING_REFUSALS = {
  closed: [409, 'You no longer write with this person.'],
  'sender-needs-city': [409, 'Choose your city first.'],
  'recipient-not-ready': [409, 'They have not finished setting up yet.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { correspondenceId } = await readValidatedBody(event, bodySchema.parse)
  const plan = await planSeal(db, user.id, correspondenceId, await postNow())
  if (typeof plan === 'string') {
    const [statusCode, message] = POSTING_REFUSALS[plan]
    throw createError({ statusCode, message, data: { reason: plan } })
  }
  return {
    recipientId: plan.recipientId,
    recipientName: plan.recipientName,
    recipientPublicKey: plan.recipientPublicKey,
    zone: plan.senderZone,
    pickupAt: plan.posting.at.toISOString(),
    postmark: plan.posting.postmark,
    arrives: plan.posting.promisedDate,
  }
})
