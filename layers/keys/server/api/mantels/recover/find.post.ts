// POST /api/mantels/recover/find — the mantel a recovery code belongs to, and
// the copy of its key that only the code opens. The caller sends a proof the
// code derives; the code itself never leaves their browser.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { recoveryProofSchema } from '../../../../shared/utils/mantel-format'
import { findByRecoveryProof } from '../../../utils/recovery'

const bodySchema = z.object({ proof: recoveryProofSchema })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'mantel-recover',
    limit: 10,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const { proof } = await readValidatedBody(event, bodySchema.parse)
  const found = await findByRecoveryProof(db, proof)
  return found ? { status: 'found' as const, ...found } : { status: 'unknown' as const }
})
