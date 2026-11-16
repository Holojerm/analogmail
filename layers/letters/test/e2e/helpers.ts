// Helpers the letters specs share: signing someone up to the end of sign-up,
// and making two people who have accepted each other.

import type { Browser, Page } from '@playwright/test'

import { uniqueEmail } from '../../../../test/e2e/fixtures'

const PASSWORD = 'invite-password-0001'

export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle' })
}

/** The dev-only link the page shows when no mail provider is configured, as a local path. */
export async function mailedLink(page: Page, name: string): Promise<string> {
  const href = await page.getByRole('link', { name }).getAttribute('href')
  const url = new URL(href!)
  return `${url.pathname}${url.hash}`
}

/** From the sign-up page to the end of sign-up: recovery code, then a city. */
export async function finishSignUp(page: Page, email: string): Promise<void> {
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

export interface Pair {
  ann: Page
  bob: Page
  close: () => Promise<void>
}

let network = 30

/**
 * A device on its own network. Outside Cloudflare every caller shares one
 * rate-limit bucket, and a spec's sign-ups would spend the budget the other
 * sign-in specs run on; a forwarded address gives each device its own.
 */
export async function device(browser: Browser, baseURL: string): Promise<Page> {
  network += 1
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { 'x-forwarded-for': `203.0.113.${network}` },
  })
  return context.newPage()
}

/** Ann Tester and Bob Tester, signed up in Chicago and writing to each other. */
export async function makePair(browser: Browser, baseURL: string): Promise<Pair> {
  const ann = await device(browser, baseURL)
  const bob = await device(browser, baseURL)
  // The city list is not a migration; the dev seed offers three cities.
  await ann.request.post('/api/dev/seed')

  await open(ann, '/auth/sign-up')
  await finishSignUp(ann, uniqueEmail('inviter'))
  await ann.waitForURL('**/people', { timeout: 15_000 })
  await ann.getByLabel('Your name').fill('Ann Tester')
  await ann.getByRole('button', { name: 'Save name' }).click()
  const bobEmail = uniqueEmail('invitee')
  await ann.getByLabel('Their email').fill(bobEmail)
  await ann.getByRole('button', { name: 'Send invitation' }).click()
  const link = new URL((await ann.getByTestId('invite-link').innerText()).trim())

  await open(bob, link.pathname)
  await bob.getByRole('link', { name: 'Create an account to accept' }).click()
  await bob.waitForURL('**/auth/sign-up')
  await finishSignUp(bob, bobEmail)
  await bob.waitForURL(`**${link.pathname}`, { timeout: 15_000 })
  await bob.getByLabel('Your name').fill('Bob Tester')
  await bob.getByRole('button', { name: 'Save and accept' }).click()
  await bob.waitForURL('**/people', { timeout: 15_000 })
  await ann.reload({ waitUntil: 'networkidle' })

  return {
    ann,
    bob,
    close: async () => {
      await ann.context().close()
      await bob.context().close()
    },
  }
}
