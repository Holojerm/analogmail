// POST /api/letters/drafts/open — a letter as its author reads it back: the
// ciphertext and their own wrapped key. Works for drafts and sealed letters.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { ownLetter } from '../../../utils/drafts'

const bodySchema = z.object({ id: letterIdSchema })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id } = await readValidatedBody(event, bodySchema.parse)
  const letter = await ownLetter(db, user.id, id)
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
