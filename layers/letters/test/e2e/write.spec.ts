// Writing, end to end in Chromium: a letter is encrypted in the browser,
// sealed with its arrival day shown, recalled before pickup, and reads back
// only on a device that holds the key.

import { expect, test } from '../../../../test/e2e/fixtures'

import { makePair } from './helpers'

const TEXT = 'Dear Bob, the plums are ripe. Come in August.'

test('a letter: written, sealed, recalled and sealed again', async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  const { ann, close } = await makePair(browser, baseURL!)

  // ── Ann writes; the draft is saved encrypted ───────────────────────────────
  await ann.getByRole('link', { name: 'Write to Bob Tester' }).click()
  await ann.waitForURL('**/write?to=*')
  await expect(ann.getByRole('heading', { name: 'A letter to Bob Tester' })).toBeVisible()
  const saved = ann.waitForRequest(
    (request) => request.url().endsWith('/api/letters/drafts') && request.method() === 'PUT',
  )
  await ann.getByLabel('Your letter').fill(TEXT)
  const sent = (await saved).postData() ?? ''
  expect(sent).toContain('"ciphertext":"v1.')
  expect(sent).not.toContain('plums')
  await expect(ann.getByText('Saved, encrypted on this device.')).toBeVisible()
  await ann.waitForURL('**/write?letter=*')

  // ── Sealing says when it is collected and when it arrives ──────────────────
  await ann.getByRole('button', { name: 'Seal the letter' }).click()
  // Pickup is 5 pm in Chicago, where she lives, whatever zone the browser is in.
  await expect(ann.getByText(/It will be collected on \w+ at 5:00.+ and arrives/)).toBeVisible()
  await ann.getByRole('button', { name: 'Seal and post' }).click()
  await ann.waitForURL('**/desk')
  await expect(ann.getByText(/^Sealed\. Collected .+, arrives .+\.$/)).toBeVisible()

  // It reads back on this device, and cannot be changed.
  await ann.getByRole('link', { name: 'Read your letter to Bob Tester' }).click()
  await expect(ann.getByText('This letter is sealed')).toBeVisible()
  await expect(ann.getByText(TEXT)).toBeVisible()
  await expect(ann.getByLabel('Your letter')).toHaveCount(0)

  // ── Before pickup it can be recalled, changed and sealed again ─────────────
  await ann.goto('/desk', { waitUntil: 'networkidle' })
  await ann.getByRole('button', { name: 'Recall the letter to Bob Tester' }).click()
  await expect(ann.getByText(/^Draft, edited /)).toBeVisible()
  await ann.getByRole('link', { name: 'Continue' }).click()
  await expect(ann.getByLabel('Your letter')).toHaveValue(TEXT)
  await ann.getByLabel('Your letter').fill(`${TEXT} Bring the dog.`)
  await expect(ann.getByText('Saved, encrypted on this device.')).toBeVisible()
  await ann.getByRole('button', { name: 'Seal the letter' }).click()
  await ann.getByRole('button', { name: 'Seal and post' }).click()
  await ann.waitForURL('**/desk')
  await expect(ann.getByText(/^Sealed\. Collected /)).toBeVisible()
  await expect(ann.getByText('No drafts.')).toBeVisible()

  await close()
})
