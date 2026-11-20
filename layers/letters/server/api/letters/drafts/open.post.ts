// POST /api/letters/drafts/open — a letter as its author reads it back: the
// ciphertext and their own wrapped key. Works for drafts and sealed letters.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { ownLetter } from '../../../utils/drafts'
import { requireAuthor } from '../../../utils/mantel-author'

const bodySchema = z.object({
  id: letterIdSchema,
  /** Writing as a child's mantel the caller keeps. */
  mantelId: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id, mantelId } = await readValidatedBody(event, bodySchema.parse)
  const letter = await ownLetter(db, await requireAuthor(db, user.id, mantelId), id)
  if (!letter) throw createError({ statusCode: 404, message: 'That letter is not yours.' })
  return {
    id: letter.id,
    correspondenceId: letter.correspondenceId,
    ciphertext: letter.ciphertext,
    wrappedKey: letter.wrappedKey,
    sealed: Boolean(letter.sealedAt),
    inReplyTo: letter.inReplyTo,
  }
})
