// Both tests here move the dev clock, which every browser shares, so they
// live in one file and run one after the other.
//
// A letter, end to end in Chromium: encrypted in the browser, sealed with
// its arrival day shown, recalled before pickup, delivered days later on the
// recipient's mail day, read there, and answered.

import { readFile } from 'node:fs/promises'

import { expect, test } from '../../../../test/e2e/fixtures'

import { makePair, open } from './helpers'

// The suite runs tests in parallel even inside a file. These two must not.
test.describe.configure({ mode: 'serial' })

const TEXT = 'Dear Bob, the plums are ripe. Come in August.'
// A 1 × 1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

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

  // ── Formatting and a hand of her own are part of the encrypted letter ──────
  await ann.getByLabel('Your letter').press('ControlOrMeta+a')
  await ann.getByRole('button', { name: 'Bold' }).click()
  await ann.getByRole('button', { name: 'Centre' }).click()
  await ann.getByLabel('Hand').click()
  await ann.getByRole('option', { name: 'Quick hand' }).click()

  // ── A photo is redrawn and encrypted here; the server gets a sealed file ───
  const uploaded = ann.waitForRequest(
    (request) => request.url().includes('/api/letters/drafts/photo?') && request.method() === 'PUT',
  )
  await ann
    .getByLabel('Add a photo')
    .setInputFiles({ name: 'plums.png', mimeType: 'image/png', buffer: PNG })
  const file = (await uploaded).postDataBuffer()
  expect(file?.[0]).toBe(1)
  expect(file?.includes('PNG')).toBe(false)
  expect(file?.includes('JFIF')).toBe(false)
  await ann.getByLabel('Describe the photo').fill('The plum tree')

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
  await expect(ann.getByRole('img', { name: 'The plum tree' })).toBeVisible()
  await expect(ann.getByLabel('Your letter')).toHaveCount(0)

  // ── Before pickup it can be recalled, changed and sealed again ─────────────
  await ann.goto('/desk', { waitUntil: 'networkidle' })
  await ann.getByRole('button', { name: 'Recall the letter to Bob Tester' }).click()
  await expect(ann.getByText(/^Draft, edited /)).toBeVisible()
  await ann.getByRole('link', { name: 'Continue' }).click()
  await expect(ann.getByLabel('Your letter')).toHaveText(TEXT)
  await expect(ann.getByLabel('Describe the photo')).toHaveValue('The plum tree')
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
    await expect(bob.locator('article.letter-face-hand strong')).toHaveText(
      `${TEXT} Bring the dog.`,
    )
    await expect(bob.locator('article.letter-face-hand p.letter-align-center')).toHaveCount(1)
    await expect(bob.getByRole('img', { name: 'The plum tree' })).toBeVisible()
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

    // ── He keeps a copy: made on his device, readable without Dear Mantel ────
    await bob.getByRole('link', { name: 'Keep a copy of your letters' }).click()
    await bob.waitForURL('**/archive')
    await expect(bob.getByText('2 letters')).toBeVisible()
    const saving = bob.waitForEvent('download')
    await bob.getByRole('button', { name: 'Save a copy of your letters with Ann Tester' }).click()
    const download = await saving
    expect(download.suggestedFilename()).toMatch(/^Dear Mantel Ann Tester \d{4}-\d{2}-\d{2}\.zip$/)
    await expect(bob.getByText('Saved 2 letters.')).toBeVisible()
    const archive = (await readFile(await download.path())).toString('latin1')
    expect(archive.startsWith('PK')).toBe(true)
    for (const part of ['README.txt', 'letters.html', 'from Ann Tester.txt', 'to Ann Tester.txt']) {
      expect(archive).toContain(part)
    }
    expect(archive).toContain(`${TEXT} Bring the dog.`)
    expect(archive).toMatch(/photos\/001 \d{4}-\d{2}-\d{2} from Ann Tester\.jpg/)

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

// Letters to a kept mantel: it gets its own post, a keeper writes to it, one
// letter is sealed until a far-off day, and after delivery the server gives
// up the open letter and nothing of the sealed one.
const NOW_LETTER = 'Dear Leo, you laughed for the first time today.'
const LATER_LETTER = 'Dear Leo, read this when you are eighteen.'

test('a kept mantel takes letters, and a sealed one stays sealed', async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  const { ann, close } = await makePair(browser, baseURL!)

  // ── Ann opens Leo's mantel and gives it its post ───────────────────────────
  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  await ann.getByLabel('I have written my recovery code down').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  const mantelId = new URL(ann.url()).pathname.split('/').pop()!
  await ann.getByLabel("The mantel's city").fill('Chicago')
  await ann
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()
  await expect(ann.getByText(/Its post arrives in Chicago/)).toBeVisible()

  // ── She writes one letter to be read now, and one sealed until 2044 ────────
  async function write(text: string, sealUntil?: string) {
    await open(ann, `/mantels/${mantelId}`)
    await ann.getByRole('button', { name: 'Write to Leo' }).click()
    await ann.waitForURL('**/write?to=*')
    await expect(ann.getByRole('heading', { name: 'A letter to Leo' })).toBeVisible()
    await ann.getByLabel('Your letter').fill(text)
    await expect(ann.getByText('Saved, encrypted on this device.')).toBeVisible()
    await ann.getByRole('button', { name: 'Seal the letter' }).click()
    if (sealUntil) await ann.getByLabel('Keep it sealed until (optional)').fill(sealUntil)
    await ann.getByRole('button', { name: 'Seal and post' }).click()
    await ann.waitForURL('**/desk')
  }
  await write(NOW_LETTER)
  await write(LATER_LETTER, '2044-06-14')
  await expect(ann.getByText(/Sealed until .*2044\.$/)).toBeVisible()

  try {
    // ── Nothing shows until the mantel's own mail day ────────────────────────
    await open(ann, `/mantels/${mantelId}`)
    await expect(ann.getByText('Nothing has arrived yet.')).toBeVisible()
    for (let day = 0; day < 6; day += 1) {
      await ann.request.post('/api/dev/clock', { data: { action: 'mail-day', userId: mantelId } })
      await open(ann, `/mantels/${mantelId}`)
      if ((await ann.getByText(/^From Ann Tester$/).count()) > 1) break
    }
    await expect(ann.getByText(/^From Ann Tester$/)).toHaveCount(2)
    await expect(ann.getByText(/^Sealed\. Opens .*2044\.$/)).toBeVisible()
    // One letter can be read; the sealed one offers nothing to open.
    await expect(ann.getByRole('link', { name: 'Read the letter from Ann Tester' })).toHaveCount(1)

    // ── The open letter is decrypted here with the mantel's key ──────────────
    await ann.getByRole('link', { name: 'Read the letter from Ann Tester' }).click()
    await expect(ann.getByText(NOW_LETTER)).toBeVisible()

    // ── The server gives up nothing of the sealed one, even to its keeper ────
    const listed = (await (
      await ann.request.post('/api/letters/kept/list', { data: { mantelId } })
    ).json()) as { letters: { letterId: string; sealed: boolean }[] }
    const sealed = listed.letters.find((letter) => letter.sealed)!
    const answer = await ann.request.post('/api/letters/kept/open', {
      data: { mantelId, letterId: sealed.letterId },
    })
    expect(Object.keys((await answer.json()) as object).toSorted()).toEqual(
      ['letterId', 'opensOn', 'postmark', 'sealed'].toSorted(),
    )
    await open(ann, `/kept/${mantelId}/${sealed.letterId}`)
    await expect(ann.getByText(/Sealed until .*2044/)).toBeVisible()
    await expect(ann.getByText(LATER_LETTER)).toHaveCount(0)
  } finally {
    await ann.request.post('/api/dev/clock', { data: { action: 'reset' } })
  }

  await close()
})
