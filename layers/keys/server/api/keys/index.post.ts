// POST /api/keys — a new account's public key with its first two wraps.
// 409 when the account already has keys: a public key is never replaced.

import { db } from '@nuxthub/db'

import { createAccountKeys, createKeysSchema } from '../../utils/keys'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, { name: 'keys-write', limit: 20, windowSeconds: 60, identifier: user.id })
  const body = await readValidatedBody(event, createKeysSchema.parse)
  if (!(await createAccountKeys(db, user.id, body))) {
    throw createError({ statusCode: 409, message: 'This account already has keys' })
  }
  return { ok: true }
})
