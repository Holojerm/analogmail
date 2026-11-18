// POST /api/letters/kept/rekey — store a mantel's new key: its keepers'
// copies, its recovery copy, and every letter key wrapped again, all made in
// the caller's browser. One transaction, or nothing.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { mantelRekeySchema, rekeyMantel } from '../../../utils/kept-rekey'

const REFUSALS = {
  'not-keeper': [404, 'You do not keep that mantel.'],
  'not-due': [409, "This mantel's key does not need changing."],
  changed: [409, 'Something changed on this mantel while its key was being changed. Try again.'],
  'keepers-changed': [409, 'Who keeps this mantel has changed. Try again.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'mantel-rekey',
    limit: 20,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const body = await readValidatedBody(event, mantelRekeySchema.parse)
  const result = await rekeyMantel(db, user.id, body, await postNow())
  if (result !== 'rekeyed') {
    const [statusCode, message] = REFUSALS[result]
    throw createError({ statusCode, message, data: { reason: result } })
  }
  return { ok: true }
})
