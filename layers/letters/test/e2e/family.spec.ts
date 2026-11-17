// A family, in Chromium: started, joined by invitation, and written to, with
// each reader's own arrival day shown before the letter is sealed.

import { expect, test } from '../../../../test/e2e/fixtures'

import { makePair, open } from './helpers'

test('a family: started, joined, and written to', async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  // ── Ann starts the family and invites Bob ──────────────────────────────────
  await open(ann, '/people')
  await ann.getByLabel('Start a family').fill('The Testers')
  await ann.getByRole('button', { name: 'Start the family' }).click()
  await ann.waitForURL(/\/family\/[0-9a-f-]{36}$/)
  await expect(ann.getByRole('heading', { name: 'The Testers' })).toBeVisible()
  await expect(ann.getByText('There is nobody to write to yet.')).toBeVisible()
  const familyPath = new URL(ann.url()).pathname

  const session = (await (await bob.request.get('/api/_auth/session')).json()) as {
    user: { email: string }
  }
  await ann.getByLabel('Their email').fill(session.user.email)
  await ann.getByRole('button', { name: 'Send invitation' }).click()
  const link = new URL((await ann.getByTestId('family-invite-link').innerText()).trim())

  // ── Bob joins, and sees who is in it ───────────────────────────────────────
  await open(bob, link.pathname)
  await expect(
    bob.getByRole('heading', { name: 'Ann Tester invites you to The Testers' }),
  ).toBeVisible()
  await bob.getByRole('button', { name: 'Accept the invitation' }).click()
  // Accepting leads to the family's room.
  await bob.waitForURL(/\/room\/[0-9a-f-]{36}$/)
  await expect(bob.getByTestId('welcome-note')).toContainText('You are in The Testers now.')
  await open(bob, '/people')
  await bob.getByRole('link', { name: 'Open The Testers' }).click()
  await expect(bob.getByText('Ann Tester', { exact: true })).toBeVisible()
  await expect(bob.getByText('Bob Tester (you)')).toBeVisible()
  // Only the organiser invites.
  await expect(bob.getByLabel('Their email')).toHaveCount(0)

  // ── Ann writes to the family: each reader's arrival is shown, then sealed ──
  await open(ann, familyPath)
  await ann.getByRole('link', { name: 'Write to The Testers' }).click()
  await expect(ann.getByRole('heading', { name: 'A letter to The Testers' })).toBeVisible()
  await ann.getByLabel('Your letter').fill('Dear all, the plums are ripe.')
  await expect(ann.getByText('Saved, encrypted on this device.')).toBeVisible()
  await ann.getByRole('button', { name: 'Seal the letter' }).click()
  await expect(ann.getByText(/Each of them gets\s+their own copy/)).toBeVisible()
  await expect(ann.getByText(/· arrives /)).toHaveCount(1)
  const sealed = ann.waitForRequest((request) => request.url().endsWith('/api/letters/seal'))
  await ann.getByRole('button', { name: 'Seal and post' }).click()
  const body = (await sealed).postDataJSON() as { wrappedKeys: Record<string, string> }
  expect(Object.values(body.wrappedKeys)).toHaveLength(1)
  expect(Object.values(body.wrappedKeys)[0]).toMatch(/^v1\./)
  await ann.waitForURL('**/desk')
  await expect(ann.getByText('To The Testers')).toBeVisible()

  // ── Bob leaves: the family goes on, and is gone from his list ──────────────
  await open(bob, familyPath)
  await bob.getByRole('button', { name: 'Leave The Testers' }).click()
  await bob.waitForURL('**/people')
  await expect(bob.getByRole('link', { name: 'Open The Testers' })).toHaveCount(0)

  // ── The organiser renames it, then closes it for everyone ──────────────────
  await open(ann, familyPath)
  await ann.getByLabel('A new name').fill('The Tester Family')
  await ann.getByRole('button', { name: 'Rename' }).click()
  await expect(ann.getByRole('heading', { name: 'The Tester Family', exact: true })).toBeVisible()
  await ann.getByRole('button', { name: 'Close The Tester Family' }).click()
  await ann.getByRole('button', { name: 'Close for everyone' }).click()
  await ann.waitForURL('**/people')
  await expect(ann.getByRole('link', { name: 'Open The Tester Family' })).toHaveCount(0)

  await close()
})
