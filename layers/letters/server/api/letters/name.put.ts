// PUT /api/letters/name — choose the name correspondents see.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { displayNameSchema } from '../../../shared/utils/invites'
import { setDisplayName } from '../../utils/people'

const bodySchema = z.object({ name: displayNameSchema })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'letters-name',
    limit: 10,
    windowSeconds: 60,
    identifier: user.id,
  })
  const { name } = await readValidatedBody(event, bodySchema.parse)
  await setDisplayName(db, user.id, name)
  return { name }
})
