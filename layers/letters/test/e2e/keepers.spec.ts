// A mantel for a child, in Chromium: its keys are made in the browser, its
// recovery code is shown once, and a second keeper is seated only after the
// two people have the same fingerprint on their screens.

import { readFile } from 'node:fs/promises'

import { expect, test } from '../../../../test/e2e/fixtures'

import { device, makePair, open } from './helpers'

// A 1 × 1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('a kept mantel: opened, its code shown once, a second keeper seated', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  // ── Ann opens Leo's mantel; only a public key and wrapped copies leave ─────
  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  const created = ann.waitForRequest(
    (request) => request.url().endsWith('/api/mantels') && request.method() === 'POST',
  )
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  const sent = (await created).postDataJSON() as Record<string, string>
  expect(Object.keys(sent).toSorted()).toEqual(
    [
      'id',
      'keeperWrap',
      'kind',
      'name',
      'publicKey',
      'recoveryProofHash',
      'recoveryWrap',
    ].toSorted(),
  )
  expect(sent.keeperWrap).toMatch(/^v1\./)
  expect(sent.recoveryWrap).toMatch(/^v1\./)

  await expect(ann.getByRole('heading', { name: "The mantel's recovery code" })).toBeVisible()
  await ann.getByLabel('I have written my recovery code down').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  await expect(ann.getByRole('heading', { name: 'Leo' })).toBeVisible()
  await expect(ann.getByText('This mantel has one keeper')).toBeVisible()

  // ── She asks Bob. He accepts and reads his key's fingerprint to her ────────
  const session = (await (await bob.request.get('/api/_auth/session')).json()) as {
    user: { email: string }
  }
  await ann.getByLabel('Their email').fill(session.user.email)
  await ann.getByRole('button', { name: 'Ask them' }).click()
  await expect(ann.getByText(/They have not accepted yet/)).toBeVisible()

  await open(bob, '/mantels')
  await expect(bob.getByText('You keep no mantels.')).toBeVisible()
  await bob.getByRole('button', { name: 'Accept' }).click()
  await expect(bob.getByTestId('my-fingerprint')).toHaveText(/^([0-9a-f]{4} ){5}[0-9a-f]{4}$/)
  const spoken = (await bob.getByTestId('my-fingerprint').innerText()).trim()

  // ── Ann sees the same groups, and her browser wraps the key to him ─────────
  await ann.reload({ waitUntil: 'networkidle' })
  await expect(ann.getByTestId('their-fingerprint')).toHaveText(spoken)
  const granted = ann.waitForRequest(
    (request) =>
      request.url().endsWith('/api/mantels/proposals/seat') &&
      (request.postData() ?? '').includes('wrapped'),
  )
  await ann.getByRole('button', { name: 'They match. Give them the key' }).click()
  expect(((await granted).postDataJSON() as { wrapped: string }).wrapped).toMatch(/^v1\./)
  await expect(ann.getByText('Bob Tester')).toBeVisible()
  await expect(ann.getByText('This mantel has one keeper')).toHaveCount(0)

  // ── Bob keeps it now, and his device can open his copy of the key ──────────
  await open(bob, '/mantels')
  await bob.getByRole('link', { name: 'Open Leo' }).click()
  await expect(bob.getByText('Ann Tester')).toBeVisible()
  await expect(bob.getByText('Bob Tester (you)')).toBeVisible()
  await expect(bob.getByText('This device cannot open this mantel')).toHaveCount(0)

  // ── Neither of two keepers can remove the other alone ──────────────────────
  await bob
    .getByRole('button', { name: 'Propose that Ann Tester stops keeping this mantel' })
    .click()
  await expect(bob.getByText('1 of 2 keepers agree.')).toBeVisible()
  await expect(bob.getByText('Ann Tester', { exact: true })).toBeVisible()

  await close()
})

test('a keeper asks someone to write to the mantel', async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  await ann.getByLabel('I have written my recovery code down').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  await ann.getByLabel("The mantel's city").fill('Chicago')
  await ann
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()

  const session = (await (await bob.request.get('/api/_auth/session')).json()) as {
    user: { email: string }
  }
  await ann.getByLabel('Invite a writer by email').fill(session.user.email)
  await ann.getByRole('button', { name: 'Send invitation' }).click()
  const link = new URL((await ann.getByTestId('writer-invite-link').innerText()).trim())
  await expect(ann.getByText(`${session.user.email} · invited`)).toBeVisible()

  // ── Bob is asked to write to Leo, not to Ann, and cannot see the mantel ────
  await open(bob, link.pathname)
  await expect(
    bob.getByRole('heading', { name: 'Ann Tester asks you to write to Leo' }),
  ).toBeVisible()
  await bob.getByRole('button', { name: 'Accept the invitation' }).click()
  await bob.waitForURL('**/people')
  await bob.getByRole('link', { name: 'Write to Leo' }).click()
  await expect(bob.getByRole('heading', { name: 'A letter to Leo' })).toBeVisible()
  await open(bob, '/mantels')
  await expect(bob.getByText('You keep no mantels.')).toBeVisible()

  await ann.reload({ waitUntil: 'networkidle' })
  await expect(ann.getByText('Bob Tester', { exact: true })).toBeVisible()

  await close()
})

test('a wedding guest writes from the card, with no account', async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  const { ann, close } = await makePair(browser, baseURL!)

  // ── The couple's mantel, its post and its write link ───────────────────────
  await open(ann, '/mantels/new')
  await ann.getByLabel('Anniversary letters for a couple').check()
  await ann.getByLabel('Whose mantel is it?').fill('Maya and Theo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  await ann.getByLabel('I have written my recovery code down').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  await ann.getByLabel("The mantel's city").fill('Chicago')
  await ann
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()
  await expect(ann.getByText(/Its post arrives in Chicago/)).toBeVisible()
  await ann.reload({ waitUntil: 'networkidle' })
  await ann.getByRole('button', { name: 'Make the write link' }).click()
  const address = new URL((await ann.getByTestId('guest-link').innerText()).trim())
  expect(address.pathname).toMatch(/^\/w\/[A-Za-z0-9_-]{22}$/)
  expect(address.hash).toMatch(/^#[A-Za-z0-9_-]{22}$/)

  // ── A guest, signed out, on their own phone ────────────────────────────────
  // Guests are limited per address per hour; a fresh one keeps reruns honest.
  const guest = await device(browser, baseURL!, `198.51.100.${1 + Math.floor(Math.random() * 250)}`)
  await open(guest, `${address.pathname}#not-the-printed-fingerprint`)
  await expect(guest.getByText('This link does not match its card')).toBeVisible()
  await expect(guest.getByLabel('Your letter')).toHaveCount(0)

  await open(guest, `${address.pathname}${address.hash}`)
  await expect(guest.getByRole('heading', { name: 'A letter to Maya and Theo' })).toBeVisible()
  await guest.getByLabel('Your letter').fill('May your house be loud and your table long.')
  await guest.getByLabel('Signed').fill('Aunt Rosa')
  await guest
    .getByLabel('Add a photo')
    .setInputFiles({ name: 'table.png', mimeType: 'image/png', buffer: PNG })
  await guest.getByLabel('Describe the photo').fill('The long table')
  const posted = guest.waitForRequest((request) =>
    request.url().endsWith('/api/letters/guest/post-photo'),
  )
  await guest.getByRole('button', { name: 'Seal and send' }).click()
  const sent = (await posted).postDataBuffer()?.toString('latin1') ?? ''
  expect(sent).toContain('"ciphertext":"v1.')
  expect(sent).not.toContain('Rosa')
  expect(sent).not.toContain('table long')
  expect(sent).not.toContain('The long table')
  expect(sent).not.toContain('JFIF')
  await expect(guest.getByRole('heading', { name: 'Sealed' })).toBeVisible()
  await expect(guest.getByText(/^It opens on /)).toBeVisible()

  // ── The only copy the guest will ever have is made on their device ─────────
  const saving = guest.waitForEvent('download')
  await guest.getByRole('button', { name: 'Save a copy' }).click()
  const download = await saving
  expect(download.suggestedFilename()).toBe('Letter to Maya and Theo.zip')
  const copy = (await readFile(await download.path())).toString('latin1')
  expect(copy).toContain('letter.txt')
  expect(copy).toContain('photo.jpg')
  expect(copy).toContain('May your house be loud and your table long.')
  expect(copy).toContain('Aunt Rosa')
  expect(
    (await (await guest.request.get('/api/_auth/session')).json()) as object,
  ).not.toHaveProperty('user')

  // ── The couple sees that a letter came through the link, and no more ───────
  await ann.reload({ waitUntil: 'networkidle' })
  await expect(ann.getByText('1 of 300 letters received through this link.')).toBeVisible()
  await expect(ann.getByText('Nothing has arrived yet.')).toBeVisible()

  await guest.context().close()
  await close()
})

test("a mantel's recovery code: a keeper is restored at once, anyone else waits", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  const code = (await ann.getByTestId('recovery-code').innerText()).trim()
  expect(code).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/)
  await ann.getByLabel('I have written my recovery code down').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  const mantelPath = new URL(ann.url()).pathname

  // ── A wrong code opens nothing; the code itself is never sent ──────────────
  await open(bob, '/mantels/recover')
  await bob.getByLabel('Recovery code').fill('0000-0000-0000-0000-0000-0000-0000-0000')
  await bob.getByRole('button', { name: 'Use the code' }).click()
  await expect(bob.getByText('That code does not open a mantel.')).toBeVisible()

  const found = bob.waitForRequest((request) => request.url().endsWith('/api/mantels/recover/find'))
  await bob.getByLabel('Recovery code').fill(code.toLowerCase())
  await bob.getByRole('button', { name: 'Use the code' }).click()
  expect((await found).postData() ?? '').not.toContain(code.replaceAll('-', '').toLowerCase())
  await expect(bob.getByText(/You will keep Leo's mantel from /)).toBeVisible()
  await open(bob, '/mantels')
  await expect(bob.getByText('You keep no mantels.')).toBeVisible()
  await expect(bob.getByRole('button', { name: 'Become a keeper' })).toHaveCount(0)

  // ── The keeper is shown it and cancels ─────────────────────────────────────
  await open(ann, mantelPath)
  await expect(ann.getByText("This mantel's recovery code was used")).toBeVisible()
  await ann.getByRole('button', { name: 'Cancel it' }).click()
  await expect(ann.getByText("This mantel's recovery code was used")).toHaveCount(0)
  await open(bob, '/mantels')
  await expect(bob.getByText('Recovery codes you used')).toHaveCount(0)

  // ── The keeper herself uses it: her access comes back at once ──────────────
  await open(ann, '/mantels/recover')
  await ann.getByLabel('Recovery code').fill(code)
  await ann.getByRole('button', { name: 'Use the code' }).click()
  await expect(ann.getByText("This device can open Leo's mantel again")).toBeVisible()
  await ann.getByRole('link', { name: 'Open the mantel' }).click()
  await expect(ann.getByText('This device cannot open this mantel')).toHaveCount(0)

  await close()
})
