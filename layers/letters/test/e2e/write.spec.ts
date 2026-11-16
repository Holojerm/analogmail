// A letter, end to end in Chromium: encrypted in the browser, sealed with
// its arrival day shown, recalled before pickup, delivered days later on the
// recipient's mail day, read there, and answered.

import { expect, test } from '../../../../test/e2e/fixtures'

import { makePair } from './helpers'

const TEXT = 'Dear Bob, the plums are ripe. Come in August.'

test('a letter: written, sealed, recalled, delivered, read and answered', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

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

  // ── Nothing shows on Bob's mantel until his mail day comes round ───────────
  await bob.goto('/mantel', { waitUntil: 'networkidle' })
  await expect(bob.getByText('Nothing has arrived yet.')).toBeVisible()
  const session = (await (await bob.request.get('/api/_auth/session')).json()) as {
    user: { id: string }
  }
  try {
    // The dev clock: each jump is Bob's next mail day, and runs the release.
    for (let day = 0; day < 6; day += 1) {
      await ann.request.post('/api/dev/clock', {
        data: { action: 'mail-day', userId: session.user.id },
      })
      await bob.goto('/mantel', { waitUntil: 'networkidle' })
      if ((await bob.getByText('From Ann Tester').count()) > 0) break
    }
    await expect(bob.getByText('From Ann Tester')).toBeVisible()
    await expect(bob.getByText('Unopened')).toBeVisible()

    // ── He opens it on his own device and answers on a sheet below it ────────
    await bob.getByRole('link', { name: /From Ann Tester/ }).click()
    await expect(bob.getByText(`${TEXT} Bring the dog.`)).toBeVisible()
    await bob.getByRole('link', { name: 'Reply' }).click()
    await expect(bob.getByText('You are replying to')).toBeVisible()
    await expect(bob.getByText(`${TEXT} Bring the dog.`)).toBeVisible()
    await bob.getByLabel('Your letter').fill('Dear Ann, we will come. The dog too.')
    await expect(bob.getByText('Saved, encrypted on this device.')).toBeVisible()
    await bob.getByRole('button', { name: 'Seal the letter' }).click()
    await bob.getByRole('button', { name: 'Seal and post' }).click()
    await bob.waitForURL('**/desk')
    await bob.goto('/mantel', { waitUntil: 'networkidle' })
    await expect(bob.getByText('Unopened')).toHaveCount(0)

    // ── Ann is told nothing: her desk has only what the postmark allows ──────
    await ann.goto('/desk', { waitUntil: 'networkidle' })
    await expect(ann.getByText(/^(In transit, arrives|Postmarked) /)).toBeVisible()
    await expect(ann.getByRole('button', { name: /Recall/ })).toHaveCount(0)
    await ann.goto('/mantel', { waitUntil: 'networkidle' })
    await expect(ann.getByText('Nothing has arrived yet.')).toBeVisible()
  } finally {
    await ann.request.post('/api/dev/clock', { data: { action: 'reset' } })
  }

  await close()
})
