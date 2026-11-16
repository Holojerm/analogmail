// A family room in Chromium: a member adds a photo, which is made smaller in
// the browser first; everyone in the family sees it; only whoever added it
// can change it; and someone who leaves the family is shut out at once.

import { readFile } from 'node:fs/promises'

import { expect, test } from '../../../../test/e2e/fixtures'

import { makePair, open } from '../../../letters/test/e2e/helpers'

// A 1 × 1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('a family room: photos added, shared, and closed to those who leave', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  // ── A family of two ────────────────────────────────────────────────────────
  await ann.getByLabel('Start a family').fill('The Roomers')
  await ann.getByRole('button', { name: 'Start the family' }).click()
  await ann.waitForURL(/\/family\/[0-9a-f-]{36}$/)
  const familyId = new URL(ann.url()).pathname.split('/').pop()!
  const session = (await (await bob.request.get('/api/_auth/session')).json()) as {
    user: { email: string }
  }
  await ann.getByLabel('Their email').fill(session.user.email)
  await ann.getByRole('button', { name: 'Send invitation' }).click()
  const link = new URL((await ann.getByTestId('family-invite-link').innerText()).trim())
  await open(bob, link.pathname)
  await bob.getByRole('button', { name: 'Accept the invitation' }).click()
  await bob.waitForURL('**/people')

  // ── Ann adds a photo: what is sent is a JPEG the browser redrew ────────────
  await ann.getByRole('link', { name: 'The family room' }).click()
  await ann.waitForURL(`**/room/${familyId}`)
  await expect(
    ann.getByText('Everyone in the family sees this room, and we could read what is in it.'),
  ).toBeVisible()
  await expect(ann.getByText('No photos here yet.')).toBeVisible()
  const uploaded = ann.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/room/${familyId}/photos`) &&
      response.request().method() === 'POST',
  )
  await ann
    .getByLabel('Choose photos to add')
    .setInputFiles({ name: 'plums.png', mimeType: 'image/png', buffer: PNG })
  expect((await uploaded).status()).toBe(201)
  await expect(ann.getByRole('button', { name: 'Open photo' })).toHaveCount(1)
  await expect(ann.getByText(/^1 photo, /)).toBeVisible()

  const picture = await ann.request.get(
    (await ann.getByRole('button', { name: 'Open photo' }).locator('img').getAttribute('src'))!,
  )
  expect(picture.headers()['content-type']).toBe('image/jpeg')
  expect(picture.headers()['cache-control']).toContain('private')
  expect((await picture.body()).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))

  // ── She captions it and files it in an album ───────────────────────────────
  await ann.getByRole('button', { name: 'New album' }).click()
  await ann.getByLabel('Album name').fill('Summer')
  await ann.getByRole('button', { name: 'Create album' }).click()
  await ann.waitForURL(/album=[0-9a-f-]{36}/)
  await expect(ann.getByRole('heading', { name: 'Summer' })).toBeVisible()
  await ann.getByRole('link', { name: 'All', exact: true }).click()
  await ann.getByRole('button', { name: 'Open photo' }).click()
  await ann.getByLabel('Caption').fill('The plum tree')
  await ann.getByLabel('Album', { exact: true }).click()
  await ann.getByRole('option', { name: 'Summer' }).click()
  await ann.getByRole('button', { name: 'Save' }).click()
  await ann.keyboard.press('Escape')
  await expect(ann.getByRole('button', { name: 'Open photo: The plum tree' })).toBeVisible()

  // ── Bob sees it and cannot change it ───────────────────────────────────────
  // He is in one family, so "Room" opens its room.
  await bob.getByRole('link', { name: 'Room', exact: true }).click()
  await bob.waitForURL(`**/room/${familyId}`)
  await bob.getByRole('button', { name: 'Open photo: The plum tree' }).click()
  await expect(bob.getByRole('img', { name: 'The plum tree' })).toBeVisible()
  await expect(bob.getByLabel('Caption')).toHaveCount(0)
  await expect(bob.getByRole('button', { name: 'Delete photo' })).toHaveCount(0)

  // ── He keeps a copy of the room: the photo, a page that shows it, the list ──
  await bob.keyboard.press('Escape')
  await bob.getByRole('link', { name: 'Keep a copy of the room' }).click()
  await expect(bob.getByText('1 photo, under 1 MB')).toBeVisible()
  const saving = bob.waitForEvent('download')
  await bob.getByRole('button', { name: 'Save the copy' }).click()
  const download = await saving
  expect(download.suggestedFilename()).toMatch(
    /^Dear Mantel room The Roomers \d{4}-\d{2}-\d{2}\.zip$/,
  )
  const copy = (await readFile(await download.path())).toString('latin1')
  expect(copy).toContain('The Roomers/photos/Summer/')
  expect(copy).toContain('The Roomers/photos.html')
  expect(copy).toContain('<p>The plum tree</p>')
  expect(copy).toContain('where-everyone-is.txt')
  await expect(bob.getByText('Saved 1 photo.')).toBeVisible()
  await bob.getByRole('link', { name: 'Photos', exact: true }).click()

  // ── He says where he is: a city from the list, shown to the family ─────────
  await bob.getByRole('link', { name: 'Where everyone is' }).click()
  await expect(bob.getByText('Has not said')).toHaveCount(2)
  await expect(bob.getByTestId('map')).toHaveCount(0)
  await bob.getByLabel('Your city now').fill('Chic')
  await bob
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()
  await expect(bob.getByText(/^Chicago, US/)).toBeVisible()
  await open(ann, `/room/${familyId}/where`)
  await expect(ann.getByText(/^Chicago, US/)).toBeVisible()
  await expect(ann.getByText('Has not said')).toHaveCount(1)
  // The map shows one city, drawn by the server with coastlines around it.
  await expect(ann.getByTestId('map-place')).toHaveCount(1)
  expect(
    (await ann.getByTestId('map').locator('path').nth(1).getAttribute('d'))!.length,
  ).toBeGreaterThan(1000)

  // ── The gazette: this month's is not out until the month is over ───────────
  await ann.getByRole('link', { name: 'Gazette' }).click()
  await expect(ann.getByText('There is no gazette yet.')).toBeVisible()
  const thisMonth = new Date().toISOString().slice(0, 7)
  expect((await ann.request.get(`/api/room/${familyId}/issues/${thisMonth}`)).status()).toBe(404)
  await open(ann, `/room/${familyId}/gazette/${thisMonth}`)
  await expect(ann.getByText('There is no issue for that time.')).toBeVisible()
  await open(ann, `/room/${familyId}`)

  // ── He leaves the family: the room and its pictures close to him ───────────
  await open(bob, `/family/${familyId}`)
  await bob.getByRole('button', { name: 'Leave The Roomers' }).click()
  await bob.waitForURL('**/people')
  expect((await bob.request.get(`/api/room/${familyId}`)).status()).toBe(404)
  expect((await bob.request.get(picture.url())).status()).toBe(404)
  await open(bob, `/room/${familyId}`)
  await expect(bob.getByText('You are not in that family.')).toBeVisible()

  // ── Ann deletes the photo ──────────────────────────────────────────────────
  await ann.getByRole('button', { name: 'Open photo: The plum tree' }).click()
  await ann.getByRole('button', { name: 'Delete photo' }).click()
  await expect(ann.getByText('No photos here yet.')).toBeVisible()
  expect((await ann.request.get(picture.url())).status()).toBe(404)

  await close()
})
