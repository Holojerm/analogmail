// POST /api/webhooks/resend — Resend's delivery events. The only ones acted
// on are hard bounces of the notice email (../../notify/bounce.ts); everything
// else is acknowledged and dropped.
//
// 404s until NUXT_POST_RESEND_WEBHOOK_SECRET is set, so a deployment that has
// not added the webhook in Resend advertises nothing.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { handleNoticeBounce, isHardBounce } from '../../notify/bounce'
import { NOTICE_SUBJECT } from '../../notify/email'
import { verifySvixSignature } from '../../notify/svix'
import { postNow } from '../../utils/clock'

const eventSchema = z.object({
  type: z.string(),
  data: z.object({
    to: z.array(z.string()).max(50),
    subject: z.string().optional(),
    created_at: z.string().optional(),
    bounce: z.object({ type: z.string().optional() }).optional(),
  }),
})

export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig(event).post.resendWebhookSecret
  if (!secret) throw createError({ statusCode: 404, message: 'Not found' })

  const body = (await readRawBody(event, 'utf8')) ?? ''
  const signed = await verifySvixSignature(
    secret,
    {
      id: getHeader(event, 'svix-id'),
      timestamp: getHeader(event, 'svix-timestamp'),
      signature: getHeader(event, 'svix-signature'),
    },
    body,
    new Date(),
  )
  if (!signed) throw createError({ statusCode: 401, message: 'Bad signature' })

  let json: unknown = null
  try {
    json = JSON.parse(body)
  } catch {
    // Signed but not JSON: nothing to act on, and nothing a retry would fix.
  }
  const parsed = eventSchema.safeParse(json)
  // Other mail (a reset, an invite) bounces too. Only a notice returns letters.
  if (
    !parsed.success ||
    !isHardBounce(parsed.data) ||
    parsed.data.data.subject !== NOTICE_SUBJECT
  ) {
    return { handled: false }
  }

  const created = parsed.data.data.created_at ? new Date(parsed.data.data.created_at) : null
  const emailCreatedAt = created && !Number.isNaN(created.getTime()) ? created : null
  const now = await postNow()
  for (const address of parsed.data.data.to) {
    await handleNoticeBounce(db, { address, emailCreatedAt }, now)
  }
  return { handled: true }
})
