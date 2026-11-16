// A mantel for a child, in Chromium: its keys are made in the browser, its
// recovery code is shown once, and a second keeper is seated only after the
// two people have the same fingerprint on their screens.

import { expect, test } from '../../../../test/e2e/fixtures'

import { makePair, open } from './helpers'

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
    ['id', 'keeperWrap', 'kind', 'name', 'publicKey', 'recoveryWrap'].toSorted(),
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
