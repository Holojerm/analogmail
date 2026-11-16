// An invitation, end to end in Chromium: one person invites another by
// email, the other opens the link with no account, signs up, and accepting
// makes them correspondents.

import type { Page } from '@playwright/test'

import { expect, test, uniqueEmail } from '../../../../test/e2e/fixtures'

const PASSWORD = 'invite-password-0001'

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle' })
}

/** The dev-only link the page shows when no mail provider is configured, as a local path. */
async function mailedLink(page: Page, name: string): Promise<string> {
  const href = await page.getByRole('link', { name }).getAttribute('href')
  const url = new URL(href!)
  return `${url.pathname}${url.hash}`
}

/** From the sign-up page to the end of sign-up: recovery code, then a city. */
async function finishSignUp(page: Page, email: string): Promise<void> {
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await open(page, await mailedLink(page, 'Open the confirmation link'))
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('**/welcome/recovery-code', { timeout: 30_000 })
  await page.getByLabel('I have written my recovery code down').check()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL((url) => url.pathname === '/welcome', { timeout: 15_000 })
  await page.getByLabel('Your city').fill('Chicago')
  await page
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Continue' }).click()
}

test('an invitation: sent, opened signed out, accepted after sign-up', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  // Two people on two networks. Outside Cloudflare every caller shares one
  // rate-limit bucket, and two sign-ups here would spend the budget the other
  // sign-in specs run on; a forwarded address gives each device its own.
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '203.0.113.21' })
  // The city list is not a migration; the dev seed offers three cities.
  await page.request.post('/api/dev/seed')
  const ann = uniqueEmail('inviter')
  const bob = uniqueEmail('invitee')

  // ── Ann signs up, chooses her name and invites Bob ─────────────────────────
  await open(page, '/auth/sign-up')
  await finishSignUp(page, ann)
  await page.waitForURL('**/people', { timeout: 15_000 })
  await expect(page.getByText('Nobody yet.')).toBeVisible()
  await page.getByLabel('Your name').fill('Ann Tester')
  await page.getByRole('button', { name: 'Save name' }).click()
  await page.getByLabel('Their email').fill(bob)
  await page.getByRole('button', { name: 'Send invitation' }).click()
  const link = new URL((await page.getByTestId('invite-link').innerText()).trim())
  await expect(page.getByRole('heading', { name: 'Invitations waiting' })).toBeVisible()
  await expect(page.getByText(bob, { exact: true })).toBeVisible()

  // ── Bob opens the link with no account ─────────────────────────────────────
  const context = await browser.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.22' },
  })
  const other = await context.newPage()
  await open(other, link.pathname)
  await expect(
    other.getByRole('heading', { name: 'Ann Tester would like to write to you' }),
  ).toBeVisible()
  await other.getByRole('link', { name: 'Create an account to accept' }).click()
  await other.waitForURL('**/auth/sign-up')
  await finishSignUp(other, bob)

  // Sign-up ends on the people page, which leads back to the invitation.
  await other.waitForURL(`**${link.pathname}`, { timeout: 15_000 })
  await other.getByLabel('Your name').fill('Bob Tester')
  await other.getByRole('button', { name: 'Save and accept' }).click()
  await other.waitForURL('**/people', { timeout: 15_000 })
  await expect(other.getByText('Ann Tester')).toBeVisible()

  // ── Both now see each other; the invitation is spent ───────────────────────
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByText('Bob Tester')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Invitations waiting' })).toHaveCount(0)

  await open(other, link.pathname)
  await expect(other.getByText('It has already been accepted.')).toBeVisible()
  await context.close()
})
