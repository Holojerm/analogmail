// The flag email: emails/templates/mail-arrived.vue. It takes no data beyond
// the brand, so it cannot name a sender, count letters or quote one. Its link
// is the mailbox, with no token: reading needs a signed-in session.

import type { SendEmailOptions, SendEmailResult } from '#server/utils/email'
import { composeEmail, type Branding, type EmailContent } from '#server/utils/email-templates'

import type { Notifier } from './notifier'

/** Also how a bounce webhook tells a notice from the app's other mail. */
export const FLAG_SUBJECT = 'The flag is up'

export function flagEmail(brand: Branding): EmailContent {
  return composeEmail('mail-arrived', FLAG_SUBJECT, brand)
}

export function createEmailNotifier(deps: {
  brand: Branding
  /** Whether Resend is configured. Unconfigured, notices wait rather than fail. */
  configured: boolean
  send: (options: SendEmailOptions) => Promise<SendEmailResult>
}): Notifier {
  return {
    channel: 'email',
    ready: () => deps.configured,
    async notify(notice) {
      const result = await deps.send({ to: notice.address, ...flagEmail(deps.brand) })
      if (result.sent) return { ok: true }
      return { ok: false, retry: result.reason !== 'rejected', reason: result.reason }
    },
  }
}
