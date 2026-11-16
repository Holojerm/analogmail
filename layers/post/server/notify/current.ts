// The notifier this deployment sends with: email through Resend, or the local
// outbox in development (`import.meta.dev` is `false` in a production build,
// which drops that branch and the import with it).

import { sendEmail } from '#server/utils/email'
import { emailBranding } from '#server/utils/email-templates'

import { createEmailNotifier } from './email'
import type { Notifier } from './notifier'

export async function currentNotifier(): Promise<Notifier> {
  if (import.meta.dev) return (await import('../dev/outbox')).outboxNotifier
  const { resend } = useRuntimeConfig()
  return createEmailNotifier({
    brand: emailBranding(),
    configured: Boolean(resend.apiKey && resend.from),
    send: sendEmail,
  })
}
