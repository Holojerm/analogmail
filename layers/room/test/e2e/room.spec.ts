// A family room in Chromium: a member adds a photo, which is made smaller in
// the browser first; everyone in the family sees it; only whoever added it
// can change it; and someone who leaves the family is shut out at once.

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
  await expect(ann.getByText('The family room is not encrypted like your letters')).toBeVisible()
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
  await open(bob, '/rooms')
  await bob.getByRole('link', { name: 'Open the room of The Roomers' }).click()
  await bob.getByRole('button', { name: 'Open photo: The plum tree' }).click()
  await expect(bob.getByRole('img', { name: 'The plum tree' })).toBeVisible()
  await expect(bob.getByLabel('Caption')).toHaveCount(0)
  await expect(bob.getByRole('button', { name: 'Delete photo' })).toHaveCount(0)

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
