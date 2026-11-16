// Sample data for every email — what `bun run email:dev` and `bun run
// email:preview` fill the templates with, and what test/emails.test.ts renders
// to prove every template compiles, fills in and escapes. One entry per file in
// emails/templates/; the test fails when the two lists disagree.
//
// Plain data, no imports: it runs in Bun (the dev server) and in workerd (the
// test suite), which share nothing else.

export type EmailSample = Record<string, unknown>

const brand = { appName: 'My App', appUrl: 'https://my-app.example' }

export const SAMPLES: Record<string, EmailSample> = {
  'account-deleted': { ...brand, name: 'Ada' },
  'activation-nudge': { ...brand, name: 'Ada' },
  'feedback-reply': {
    ...brand,
    reply: 'Fixed in this morning’s release — thanks for the report.',
    quoted: 'The export button does nothing on Safari',
  },
  invite: {
    ...brand,
    inviterName: 'Ada Lovelace',
    url: `${brand.appUrl}/invite/3q2-8wZk1fYb7Jm4Xc9RtLpNv6HsQeUa0DgKoIiTyBw`,
    expiresDays: 30,
  },
  'mantel-invite': {
    ...brand,
    inviterName: 'Ada Lovelace',
    url: `${brand.appUrl}/invite/3q2-8wZk1fYb7Jm4Xc9RtLpNv6HsQeUa0DgKoIiTyBw`,
    expiresDays: 30,
    mantelName: 'Leo',
  },
  'mail-arrived': { ...brand },
  'magic-link': {
    ...brand,
    url: `${brand.appUrl}/auth/confirm?token=2f9c1d`,
    expiresMinutes: 15,
  },
  'password-reset': {
    ...brand,
    url: `${brand.appUrl}/auth/reset#token=8a1b3c`,
    expiresMinutes: 30,
  },
  'verify-email': {
    ...brand,
    url: `${brand.appUrl}/auth/verify-email#token=5d7e9f`,
    expiresMinutes: 60,
  },
  welcome: { ...brand, name: 'Ada' },
}
