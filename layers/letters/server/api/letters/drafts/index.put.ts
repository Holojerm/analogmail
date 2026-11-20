// PUT /api/letters/drafts — save a draft: created on its first save, replaced
// after. With `mantelId`, a keeper saves it as the child's mantel.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import {
  letterCiphertextSchema,
  letterIdSchema,
  letterKeySchema,
} from '../../../../shared/utils/letter-doc'
import { PUBLIC_KEY_PATTERN } from '#layers/keys/shared/utils/key-format'

import { saveDraft } from '../../../utils/drafts'
import { requireAuthor } from '../../../utils/mantel-author'

const bodySchema = z.object({
  id: letterIdSchema,
  correspondenceId: z.string().min(1).max(64),
  ciphertext: letterCiphertextSchema,
  wrappedKey: letterKeySchema,
  inReplyTo: letterIdSchema.nullish(),
  /** Writing as a child's mantel the caller keeps. */
  mantelId: z.string().uuid().optional(),
  /** As a mantel: the mantel's public key the author's copy was wrapped to. */
  authorKey: z.string().regex(PUBLIC_KEY_PATTERN).optional(),
})

const REFUSALS = {
  'not-yours': [404, 'That letter is not yours.'],
  sealed: [409, 'That letter is sealed. Recall it to change it.'],
  closed: [409, 'You no longer write with this person.'],
  'not-received': [400, 'That is not a letter you can reply to.'],
  'key-changed': [409, "The mantel's key has changed. Open the letter again."],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'letters-draft',
    limit: 120,
    windowSeconds: 60,
    identifier: user.id,
  })
  const { mantelId, authorKey, ...draft } = await readValidatedBody(event, bodySchema.parse)
  const author = await requireAuthor(db, user.id, mantelId)
  if (mantelId && !authorKey) {
    throw createError({ statusCode: 400, message: 'Open the letter again.' })
  }
  const result = await saveDraft(
    db,
    author,
    { ...draft, authorKey: mantelId ? authorKey : undefined },
    await postNow(),
  )
  if (result !== 'saved') {
    const [statusCode, message] = REFUSALS[result]
    throw createError({ statusCode, message, data: { reason: result } })
  }
  return { ok: true }
})
