// POST /api/letters/families/rename — the organiser renames a family.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { renameFamily } from '../../../utils/families'

const bodySchema = z.object({ familyId: z.string().uuid(), name: z.string().max(200) })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { familyId, name } = await readValidatedBody(event, bodySchema.parse)
  const result = await renameFamily(db, user.id, familyId, name, await postNow())
  if (result === 'bad-name') {
    throw createError({ statusCode: 400, message: 'Give the family a name.' })
  }
  if (result !== 'done') {
    throw createError({ statusCode: 403, message: 'Only the organiser renames the family.' })
  }
  return { ok: true }
})
