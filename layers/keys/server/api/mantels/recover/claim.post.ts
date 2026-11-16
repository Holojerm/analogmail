// POST /api/mantels/recover/claim — hand in the copy of the mantel's key the
// caller's browser wrapped to them with the recovery code. A keeper's access
// is restored at once. Anyone else starts the wait, and every keeper is told.

import { db } from '@nuxthub/db'
import { inArray } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import { mailableMantelName } from '#layers/letters/shared/utils/invites'
import { postNow } from '#layers/post/server/utils/clock'
import { sendEmail } from '#server/utils/email'
import { composeEmail, emailBranding } from '#server/utils/email-templates'

import { KEEPER_WRAP_PATTERN, recoveryProofSchema } from '../../../../shared/utils/mantel-format'
import { claimRecovery } from '../../../utils/recovery'

const bodySchema = z.object({
  proof: recoveryProofSchema,
  wrapped: z.string().regex(KEEPER_WRAP_PATTERN),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'mantel-recover',
    limit: 10,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const body = await readValidatedBody(event, bodySchema.parse)
  const result = await claimRecovery(db, user.id, body, await postNow())
  if (result.status === 'restored') return { status: 'restored' as const }
  if (result.status !== 'waiting') {
    throw result.status === 'no-keys'
      ? createError({ statusCode: 409, message: 'Set up your own keys first.' })
      : createError({ statusCode: 404, message: 'That code does not open a mantel.' })
  }

  if (result.keeperIds.length > 0) {
    const brand = emailBranding()
    const mantelName = mailableMantelName(result.name)
    const readyDate = result.readyAt.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    const keepers = await db
      .select({ email: tables.users.email })
      .from(tables.users)
      .where(inArray(tables.users.id, result.keeperIds))
    for (const keeper of keepers) {
      await sendEmail({
        to: keeper.email,
        ...composeEmail('mantel-recovery', `The recovery code for ${mantelName} was used`, brand, {
          mantelName,
          readyDate,
          url: `${brand.appUrl}/mantels/${result.mantelId}`,
        }),
      })
    }
  }
  return { status: 'waiting' as const, readyAt: result.readyAt.toISOString() }
})
