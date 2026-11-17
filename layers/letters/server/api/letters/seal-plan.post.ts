// POST /api/letters/seal-plan — what sealing would mean now: who reads the
// letter, the public key to wrap its key to, and when it would be collected
// and arrive.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { planSeal } from '../../utils/posting'

const bodySchema = z.object({
  correspondenceId: z.string().min(1).max(64),
  /** News of a child only: also send a copy to the child's mantel. */
  withChild: z.boolean().optional(),
})

const POSTING_REFUSALS = {
  closed: [409, 'You no longer write with this person.'],
  'sender-needs-city': [409, 'Choose your city first.'],
  'recipient-not-ready': [409, 'They have not finished setting up yet.'],
  'no-readers': [409, 'Nobody gets this news yet. Invite someone, or keep a copy for the child.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { correspondenceId, withChild } = await readValidatedBody(event, bodySchema.parse)
  const plan = await planSeal(db, user.id, correspondenceId, await postNow(), withChild ?? false)
  if (typeof plan === 'string') {
    const [statusCode, message] = POSTING_REFUSALS[plan]
    throw createError({ statusCode, message, data: { reason: plan } })
  }
  return {
    recipientName: plan.family ?? plan.news ?? plan.recipientName,
    // Every reader, with the key to wrap the letter's key to and their own arrival.
    readers: plan.recipients.map((reader) => ({
      id: reader.id,
      name: reader.name,
      publicKey: reader.publicKey,
      arrives: reader.posting.promisedDate,
    })),
    toMantel: plan.toMantel,
    toFamily: Boolean(plan.family),
    // The child's name when this is news of them, and whether their mantel gets a copy.
    news: plan.news,
    withChild: plan.withChild,
    zone: plan.senderZone,
    pickupAt: plan.posting.at.toISOString(),
    postmark: plan.posting.postmark,
    arrives: plan.lastArrival,
  }
})
