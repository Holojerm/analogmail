// A mantel's re-key against a real D1, as far as letters go: every letter key
// the mantel holds moves to the new key in the same transaction, none is left
// behind however the timing falls, the write link goes, and a letter wrapped
// to the old key is refused afterwards.

import { env } from 'cloudflare:test'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { sha256Hex } from '#server/utils/hash'

import { openMantelCorrespondence } from '../server/utils/correspondences'
import { saveDraft } from '../server/utils/drafts'
import { postGuestLetter } from '../server/utils/guest-letters'
import {
  mantelRekeyPlan,
  mantelRekeySchema,
  rekeyMantel,
  REKEY_LETTERS_MAX,
  type MantelRekey,
} from '../server/utils/kept-rekey'
import { recallLetter, sealLetter } from '../server/utils/posting'

const db = drizzle(env.DB, { schema })
const {
  users,
  userKeys,
  postalProfiles,
  mantels,
  mantelKeepers,
  mantelKeyWraps,
  correspondences,
  correspondenceMembers,
  letters,
  letterKeys,
  deliveries,
  guestLinks,
  batchGuards,
} = schema

const PIP = 'bbbbbbbb-0000-4000-8000-000000000002'
const MONDAY = new Date('2026-11-16T20:00:00Z')
const TUESDAY = new Date('2026-11-17T20:00:00Z')
const OLD_KEY = 'pip-key'
const NEW_KEY = 'B'.repeat(122)
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`
const CHICAGO = {
  cityName: 'Chicago',
  country: 'US',
  lat: 41.85,
  lng: -87.65,
  timeZone: 'America/Chicago',
}
const CARD = { link: 'L'.repeat(22), secret: 'S'.repeat(22) }
const keeperWrap = (who: string) => `v1.${'P'.repeat(87)}.${'I'.repeat(16)}.${who.padEnd(160, 'W')}`
const letterId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const rewrapped = (id: string) => `new-key-for-${id}`

let toPip = ''

/** Ann writes to the mantel she keeps, wrapping to whichever key she was shown. */
async function write(n: number, wrappedTo = OLD_KEY, opensOn: string | null = null) {
  const id = letterId(n)
  await saveDraft(
    db,
    'ann',
    { id, correspondenceId: toPip, ciphertext: CIPHERTEXT, wrappedKey: `ann-copy-of-${id}` },
    MONDAY,
  )
  return sealLetter(db, 'ann', id, `old-key-for-${id}`, MONDAY, opensOn, false, {
    [PIP]: wrappedTo,
  })
}

const held = async () =>
  Object.fromEntries(
    (await db.select().from(letterKeys).where(eq(letterKeys.userId, PIP))).map((row) => [
      row.letterId,
      row.wrappedKey,
    ]),
  )

/** What Ann's browser sends: the new key, and each letter key it was given wrapped again. */
async function request(ids: string[]): Promise<MantelRekey> {
  return {
    mantelId: PIP,
    keyVersion: 1,
    publicKey: NEW_KEY,
    keeperWrap: keeperWrap('ann-new'),
    recoveryWrap: `v1.${'I'.repeat(16)}.${'N'.repeat(160)}`,
    recoveryProofHash: await sha256Hex('new-proof'),
    handovers: { bob: keeperWrap('bob-handover') },
    letterKeys: ids.map((id) => ({ letterId: id, wrappedKey: rewrapped(id) })),
  }
}

const planned = async () =>
  (await mantelRekeyPlan(db, 'ann', PIP))!.letterKeys.map((key) => key.letterId).toSorted()

beforeEach(async () => {
  for (const table of [
    schema.mantelOpenings,
    deliveries,
    letterKeys,
    letters,
    guestLinks,
    correspondenceMembers,
    correspondences,
    mantelKeyWraps,
    mantelKeepers,
    mantels,
    postalProfiles,
    userKeys,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const id of ['ann', 'bob']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
    await db.insert(postalProfiles).values({ userId: id, ...CHICAGO })
  }
  // A couple's mantel that a third keeper has just left.
  await db.insert(mantels).values({
    id: PIP,
    kind: 'anniversary',
    name: 'Pip and Sam',
    publicKey: OLD_KEY,
    rekeyDueAt: MONDAY,
  })
  await db.insert(mantelKeepers).values([
    { mantelId: PIP, userId: 'ann', role: 'partner' },
    { mantelId: PIP, userId: 'bob', role: 'partner' },
  ])
  await db.insert(mantelKeyWraps).values([
    { mantelId: PIP, kind: 'keeper', keeperId: 'ann', wrapped: keeperWrap('ann') },
    { mantelId: PIP, kind: 'keeper', keeperId: 'bob', wrapped: keeperWrap('bob') },
    { mantelId: PIP, kind: 'recovery', wrapped: 'old-recovery' },
  ])
  await db.insert(postalProfiles).values({ userId: PIP, ...CHICAGO })
  await db
    .insert(schema.mantelOpenings)
    .values({ mantelId: PIP, onArrival: true, days: [{ on: '2044-06-14', label: '' }] })
  toPip = (await openMantelCorrespondence(db, 'ann', PIP, MONDAY))!
  // The couple's write link, with one guest letter through it.
  const guests = crypto.randomUUID()
  await db.insert(correspondences).values({ id: guests, mantelId: PIP })
  await db.insert(correspondenceMembers).values({ correspondenceId: guests, userId: PIP })
  await db.insert(guestLinks).values({
    id: CARD.link,
    secretHash: await sha256Hex(CARD.secret),
    mantelId: PIP,
    correspondenceId: guests,
    opensOn: '2027-11-14',
    closesOn: '2026-12-16',
  })
})

describe('the plan', () => {
  it('holds every letter key kept for the mantel, sealed or on its way, and no one else’s', async () => {
    expect((await write(1)).status).toBe('sealed')
    expect((await write(2, OLD_KEY, '2044-06-14')).status).toBe('sealed')
    const guest = { id: letterId(3), ciphertext: CIPHERTEXT, wrappedKey: 'old-key-for-guest' }
    expect((await postGuestLetter(db, CARD, guest, MONDAY)).status).toBe('posted')

    const plan = await mantelRekeyPlan(db, 'ann', PIP)
    expect(plan).toMatchObject({ keyVersion: 1, publicKey: OLD_KEY, hasWriteLink: true })
    expect(plan!.others).toEqual([{ userId: 'bob', publicKey: 'public-key-of-bob' }])
    expect(plan!.letterKeys.toSorted((a, b) => a.letterId.localeCompare(b.letterId))).toEqual([
      { letterId: letterId(1), wrappedKey: `old-key-for-${letterId(1)}` },
      { letterId: letterId(2), wrappedKey: `old-key-for-${letterId(2)}` },
      { letterId: letterId(3), wrappedKey: 'old-key-for-guest' },
    ])
    // Nothing of the letters themselves comes with their keys.
    expect(JSON.stringify(plan)).not.toContain(CIPHERTEXT)
  })

  it('is for a keeper of a mantel that is due a re-key', async () => {
    expect(await mantelRekeyPlan(db, 'eve', PIP)).toBeNull()
    await db.update(mantels).set({ rekeyDueAt: null })
    expect(await mantelRekeyPlan(db, 'ann', PIP)).toBeNull()
  })
})

describe('changing the key', () => {
  it('moves every letter key with it, and touches no one else’s copy', async () => {
    await write(1)
    await write(2, OLD_KEY, '2044-06-14')
    const ids = await planned()
    expect(mantelRekeySchema.shape.letterKeys.safeParse([]).success).toBe(true)

    expect(await rekeyMantel(db, 'ann', await request(ids), TUESDAY)).toBe('rekeyed')

    expect(await held()).toEqual({
      [letterId(1)]: rewrapped(letterId(1)),
      [letterId(2)]: rewrapped(letterId(2)),
    })
    const mine = await db
      .select({ wrappedKey: letterKeys.wrappedKey })
      .from(letterKeys)
      .where(eq(letterKeys.userId, 'ann'))
    expect(mine.map((row) => row.wrappedKey).toSorted()).toEqual([
      `ann-copy-of-${letterId(1)}`,
      `ann-copy-of-${letterId(2)}`,
    ])
    const [mantel] = await db.select().from(mantels)
    expect(mantel).toMatchObject({ publicKey: NEW_KEY, keyVersion: 2, rekeyDueAt: null })
    expect(await db.select().from(batchGuards)).toEqual([])
  })

  it('stores nothing when a letter arrived that the browser never saw', async () => {
    await write(1)
    const ids = await planned()
    await write(2)

    expect(await rekeyMantel(db, 'ann', await request(ids), TUESDAY)).toBe('changed')
    expect(await held()).toEqual({
      [letterId(1)]: `old-key-for-${letterId(1)}`,
      [letterId(2)]: `old-key-for-${letterId(2)}`,
    })
    const [mantel] = await db.select().from(mantels)
    expect(mantel).toMatchObject({ publicKey: OLD_KEY, keyVersion: 1 })
    expect((await db.select().from(mantelKeyWraps)).map((row) => row.kind).toSorted()).toEqual([
      'keeper',
      'keeper',
      'recovery',
    ])

    // Starting again from what is there now goes through.
    expect(await rekeyMantel(db, 'ann', await request(await planned()), TUESDAY)).toBe('rekeyed')
    expect(Object.keys(await held())).toHaveLength(2)
  })

  it('ignores a key for a letter that has since been taken back', async () => {
    await write(1)
    await write(2)
    const ids = await planned()
    expect(await recallLetter(db, 'ann', letterId(2), MONDAY)).toBe('recalled')

    expect(await rekeyMantel(db, 'ann', await request(ids), TUESDAY)).toBe('rekeyed')
    expect(await held()).toEqual({ [letterId(1)]: rewrapped(letterId(1)) })
  })

  it('passes on what the keys layer refuses', async () => {
    expect(await rekeyMantel(db, 'eve', await request([]), TUESDAY)).toBe('not-keeper')
    expect(await rekeyMantel(db, 'ann', { ...(await request([])), handovers: {} }, TUESDAY)).toBe(
      'keepers-changed',
    )
    expect(await rekeyMantel(db, 'ann', { ...(await request([])), keyVersion: 7 }, TUESDAY)).toBe(
      'changed',
    )
  })

  it('moves more letter keys than one statement carries', async () => {
    const many = 2_300
    const author = env.DB.prepare(
      'INSERT INTO letter_keys (id, letter_id, user_id, wrapped_key, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)',
    )
    const rows = Array.from({ length: many }, (_, n) => letterId(n + 1))
    for (let i = 0; i < rows.length; i += 100) {
      await env.DB.batch(
        rows.slice(i, i + 100).map((id) => author.bind(`key-${id}`, id, PIP, `old-key-for-${id}`)),
      )
    }
    expect(many).toBeLessThan(REKEY_LETTERS_MAX)

    expect(await rekeyMantel(db, 'ann', await request(await planned()), TUESDAY)).toBe('rekeyed')
    const after = await held()
    expect(Object.keys(after)).toHaveLength(many)
    expect(Object.entries(after).every(([id, key]) => key === rewrapped(id))).toBe(true)
  })
})

describe('after the key has changed', () => {
  beforeEach(async () => {
    expect(await rekeyMantel(db, 'ann', await request([]), TUESDAY)).toBe('rekeyed')
  })

  it('the write link takes nothing more: its cards carry the old key', async () => {
    const [link] = await db.select().from(guestLinks)
    expect(link?.revokedAt).toEqual(TUESDAY)
    const guest = { id: letterId(9), ciphertext: CIPHERTEXT, wrappedKey: 'old-key-for-guest' }
    expect((await postGuestLetter(db, CARD, guest, TUESDAY)).status).toBe('closed')
    expect(await db.select().from(letters)).toHaveLength(0)
  })

  it('a letter wrapped to the old key is refused, and to the new one is sealed', async () => {
    expect((await write(1, OLD_KEY)).status).toBe('readers-changed')
    expect(await held()).toEqual({})
    const [draft] = await db
      .select({ sealedAt: letters.sealedAt })
      .from(letters)
      .where(eq(letters.id, letterId(1)))
    expect(draft?.sealedAt).toBeNull()

    expect((await write(2, NEW_KEY)).status).toBe('sealed')
    expect(Object.keys(await held())).toEqual([letterId(2)])
  })

  it('a letter to a mantel must say which key it was wrapped to', async () => {
    await saveDraft(
      db,
      'ann',
      { id: letterId(3), correspondenceId: toPip, ciphertext: CIPHERTEXT, wrappedKey: 'k' },
      MONDAY,
    )
    expect((await sealLetter(db, 'ann', letterId(3), 'k', MONDAY)).status).toBe('readers-changed')
  })
})

describe('a letter posted as the key changes', () => {
  it('is never stored against a link the re-key has revoked', async () => {
    // What the guest route does, in the order that loses the race: the link
    // is found open, the re-key lands, then the letter's batch runs.
    const before = await db
      .select()
      .from(guestLinks)
      .where(and(eq(guestLinks.id, CARD.link)))
    expect(before[0]?.revokedAt).toBeNull()
    const rekeyFirst = new Proxy(db, {
      get(target, property) {
        if (property === 'batch') {
          return async (statements: Parameters<typeof db.batch>[0]) => {
            await rekeyMantel(db, 'ann', await request(await planned()), TUESDAY)
            return target.batch(statements)
          }
        }
        const value = Reflect.get(target, property) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const racing = postGuestLetter(
      rekeyFirst,
      CARD,
      { id: letterId(5), ciphertext: CIPHERTEXT, wrappedKey: 'old-key-for-guest' },
      MONDAY,
    )
    expect((await racing).status).toBe('closed')
    expect(await db.select().from(letters)).toHaveLength(0)
    expect(await held()).toEqual({})
  })

  it('is never sealed to a mantel whose key changed after the check', async () => {
    await saveDraft(
      db,
      'ann',
      { id: letterId(6), correspondenceId: toPip, ciphertext: CIPHERTEXT, wrappedKey: 'k' },
      MONDAY,
    )
    const rekeyFirst = new Proxy(db, {
      get(target, property) {
        if (property === 'batch') {
          return async (statements: Parameters<typeof db.batch>[0]) => {
            await rekeyMantel(db, 'ann', await request(await planned()), TUESDAY)
            return target.batch(statements)
          }
        }
        const value = Reflect.get(target, property) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const sealed = await sealLetter(rekeyFirst, 'ann', letterId(6), 'old', MONDAY, null, false, {
      [PIP]: OLD_KEY,
    })
    expect(sealed.status).toBe('readers-changed')
    expect(await held()).toEqual({})
    const [draft] = await db.select({ sealedAt: letters.sealedAt }).from(letters)
    expect(draft?.sealedAt).toBeNull()
    expect(await db.select().from(deliveries)).toHaveLength(0)
  })
})
