// PUT /api/letters/drafts — save a draft: created on its first save, replaced after.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import {
  letterCiphertextSchema,
  letterIdSchema,
  letterKeySchema,
} from '../../../../shared/utils/letter-doc'
import { saveDraft } from '../../../utils/drafts'

const bodySchema = z.object({
  id: letterIdSchema,
  correspondenceId: z.string().min(1).max(64),
  ciphertext: letterCiphertextSchema,
  wrappedKey: letterKeySchema,
  inReplyTo: letterIdSchema.nullish(),
})

const REFUSALS = {
  'not-yours': [404, 'That letter is not yours.'],
  sealed: [409, 'That letter is sealed. Recall it to change it.'],
  closed: [409, 'You no longer write with this person.'],
  'not-received': [400, 'That is not a letter you can reply to.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'letters-draft',
    limit: 120,
    windowSeconds: 60,
    identifier: user.id,
  })
  const body = await readValidatedBody(event, bodySchema.parse)
  const result = await saveDraft(db, user.id, body, await postNow())
  if (result !== 'saved') {
    const [statusCode, message] = REFUSALS[result]
    throw createError({ statusCode, message, data: { reason: result } })
  }
  return { ok: true }
})
