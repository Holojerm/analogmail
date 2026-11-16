// PUT /api/keys/wraps — add a wrap, or replace the one for the same secret
// (a changed password, a new recovery code, a newly added passkey).

import { db } from '@nuxthub/db'

import { putKeyWrap, putWrapSchema } from '../../utils/keys'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, { name: 'keys-write', limit: 20, windowSeconds: 60, identifier: user.id })
  const body = await readValidatedBody(event, putWrapSchema.parse)
  const result = await putKeyWrap(db, user.id, body)
  if (result === 'no-keys') throw createError({ statusCode: 404, message: 'No keys yet' })
  if (result === 'unknown-passkey') {
    throw createError({ statusCode: 400, message: 'Unknown passkey' })
  }
  return { ok: true }
})
