// POST /api/mantels/proposals/seat — seat a new keeper. Without `wrapped` it
// returns the new keeper's public key, for the fingerprint check and the
// wrap. With it, it stores the copy of the mantel's key the caller's browser
// wrapped to them.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { KEEPER_WRAP_PATTERN } from '../../../../shared/utils/mantel-format'
import { grantSeat, seatToFill } from '../../../utils/custody'

const bodySchema = z
  .object({
    id: z.string().uuid(),
    wrapped: z.string().regex(KEEPER_WRAP_PATTERN).optional(),
    /** With `wrapped`: the version of the mantel's key the caller's browser opened. */
    keyVersion: z.number().int().min(1).optional(),
  })
  .refine((body) => !body.wrapped || body.keyVersion !== undefined)

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id, wrapped, keyVersion } = await readValidatedBody(event, bodySchema.parse)
  const now = await postNow()
  const notReady = () =>
    createError({ statusCode: 409, message: 'That seat is not ready to be filled.' })

  if (!wrapped || keyVersion === undefined) {
    const seat = await seatToFill(db, user.id, id, now)
    if (!seat) throw notReady()
    return { subjectId: seat.subjectId, publicKey: seat.publicKey }
  }
  if ((await grantSeat(db, user.id, id, { wrapped, keyVersion }, now)) !== 'seated') {
    throw notReady()
  }
  return { ok: true }
})
