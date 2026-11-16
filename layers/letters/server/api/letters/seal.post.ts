// POST /api/letters/seal — seal a draft. From here the post has it: it is
// collected at the next pickup and its dates are fixed.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { letterIdSchema, letterKeySchema } from '../../../shared/utils/letter-doc'
import { sealLetter } from '../../utils/posting'

const bodySchema = z.object({
  id: letterIdSchema,
  recipientWrappedKey: letterKeySchema,
  /** Only for a letter to a kept mantel: the day it is sealed until. */
  opensOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
})

const REFUSALS = {
  'not-yours': [404, 'That letter is not yours.'],
  'already-sealed': [409, 'That letter is already sealed.'],
  closed: [409, 'You no longer write with this person.'],
  'sender-needs-city': [409, 'Choose your city first.'],
  'recipient-not-ready': [409, 'They have not finished setting up yet.'],
  'cannot-seal-until': [400, 'That is not a day this letter can be sealed until.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'letters-seal',
    limit: 30,
    windowSeconds: 60,
    identifier: user.id,
  })
  const body = await readValidatedBody(event, bodySchema.parse)
  const result = await sealLetter(
    db,
    user.id,
    body.id,
    body.recipientWrappedKey,
    await postNow(),
    body.opensOn ?? null,
  )
  if (result.status !== 'sealed') {
    const [statusCode, message] = REFUSALS[result.status]
    throw createError({ statusCode, message, data: { reason: result.status } })
  }
  return {
    pickupAt: result.posting.pickupAt.toISOString(),
    postmark: result.posting.postmark,
    arrives: result.posting.promisedDate,
  }
})
