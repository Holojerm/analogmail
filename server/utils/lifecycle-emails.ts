// Copy for the template's lifecycle steps (server/utils/lifecycle-steps.ts).
//
// The wording is emails/templates/activation-nudge.vue (plus its .txt sibling); see server/utils/email-templates.ts for how that
// reaches here. One rule on top of those: a lifecycle email is unasked-for,
// so it earns its place by being short and useful to the reader, never by
// urgency. No countdown language, no "last chance", no discount to stay — the
// product rules forbid dark patterns and these are where they usually start.

import { composeEmail, type Branding, type EmailContent } from './email-templates'

/** Signed up, never finished setting up. Sent once, a day or more after signup. */
export function activationNudgeEmail(brand: Branding, opts: { name: string }): EmailContent {
  return composeEmail('activation-nudge', `Finish setting up ${brand.appName}`, brand, {
    name: opts.name,
  })
}
