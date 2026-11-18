// The notifier this deployment sends with: email through Resend, or the local
// outbox in development (`import.meta.dev` is `false` in a production build,
// which drops that branch and the import with it).

import { sendPush } from '#layers/pwa/server/utils/push'
import { sendEmail } from '#server/utils/email'
import { emailBranding } from '#server/utils/email-templates'

import { createEmailNotifier } from './email'
import type { Notifier } from './notifier'
import { createPushNotice } from './push'

/** Does nothing until the app has VAPID keys and the person turned notifications on. */
export const pushNotice = createPushNotice(sendPush)

export async function currentNotifier(): Promise<Notifier> {
  if (import.meta.dev) return (await import('../dev/outbox')).outboxNotifier
  const { resend } = useRuntimeConfig()
  return createEmailNotifier({
    brand: emailBranding(),
    configured: Boolean(resend.apiKey && resend.from),
    send: sendEmail,
  })
}
