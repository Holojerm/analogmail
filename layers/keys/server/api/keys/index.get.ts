// GET /api/keys — the caller's own public key and wraps. A wrap is ciphertext
// only its owner's secrets open, and it is only ever sent to its owner.

import { db } from '@nuxthub/db'

import { getAccountKeys } from '../../utils/keys'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, { name: 'keys-read', limit: 60, windowSeconds: 60, identifier: user.id })
  return { keys: await getAccountKeys(db, user.id) }
})
