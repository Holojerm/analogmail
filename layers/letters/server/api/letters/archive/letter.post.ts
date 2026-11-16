// POST /api/letters/archive/letter — the encrypted parts of one letter the
// caller sealed or has opened, for the copy they keep. It opens nothing.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { readForArchive } from '../../../utils/archive'

const bodySchema = z.object({ id: letterIdSchema })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id } = await readValidatedBody(event, bodySchema.parse)
  const sealed = await readForArchive(db, user.id, id)
  if (!sealed) throw createError({ statusCode: 404, message: 'That letter is not yours to copy.' })
  return sealed
})
