// The copy a person keeps, against a real D1: it offers what they sealed and
// what they have opened, counts what is still unopened without handing it
// over, and never records an opening.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { listArchive, readForArchive } from '../server/utils/archive'
import { saveDraft } from '../server/utils/drafts'
import { sealLetter } from '../server/utils/posting'

const db = drizzle(env.DB, { schema })
const {
  users,
  people,
  userKeys,
  postalProfiles,
  correspondences,
  correspondenceMembers,
  letters,
  letterKeys,
  deliveries,
} = schema

const MONDAY = new Date('2026-11-16T20:00:00Z')
const FRIDAY = new Date('2026-11-20T16:00:00Z')
const FROM_ANN = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const FROM_BOB = '9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const UNOPENED = '11111111-2222-4333-8444-555555555555'
const ON_ITS_WAY = '22222222-3333-4444-8555-666666666666'
const DRAFT = '66666666-7777-4888-9999-aaaaaaaaaaaa'
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`

async function post(id: string, author: 'ann' | 'bob', seal = true) {
  const reader = author === 'ann' ? 'bob' : 'ann'
  await saveDraft(
    db,
    author,
    { id, correspondenceId: 'pair', ciphertext: CIPHERTEXT, wrappedKey: `key-for-${author}` },
    MONDAY,
  )
  if (seal) await sealLetter(db, author, id, `key-for-${reader}`, MONDAY)
}

const arrive = (id: string, opened: boolean) =>
  db
    .update(deliveries)
    .set({
      state: 'delivered',
      deliveredAt: FRIDAY,
      mailDate: '2026-11-20',
      openedAt: opened ? FRIDAY : null,
    })
    .where(eq(deliveries.letterId, id))

beforeEach(async () => {
  for (const table of [
    deliveries,
    letterKeys,
    letters,
    correspondenceMembers,
    correspondences,
    postalProfiles,
    userKeys,
    people,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const id of ['ann', 'bob', 'cal']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
    await db.insert(postalProfiles).values({
      userId: id,
      cityName: 'Chicago',
      country: 'US',
      lat: 41.85,
      lng: -87.65,
      timeZone: 'America/Chicago',
    })
  }
  await db.insert(people).values([
    { userId: 'ann', displayName: 'Ann Lee' },
    { userId: 'bob', displayName: 'Bob Stone' },
  ])
  await db.insert(correspondences).values({ id: 'pair' })
  await db.insert(correspondenceMembers).values([
    { correspondenceId: 'pair', userId: 'ann' },
    { correspondenceId: 'pair', userId: 'bob' },
  ])

  await post(FROM_ANN, 'ann')
  await post(DRAFT, 'ann', false)
  await post(FROM_BOB, 'bob')
  await post(UNOPENED, 'bob')
  await post(ON_ITS_WAY, 'bob')
  await arrive(FROM_ANN, true)
  await arrive(FROM_BOB, true)
  await arrive(UNOPENED, false)
})

describe('what can be copied', () => {
  it('lists what they sealed and what they have opened, in order', async () => {
    const [shelf, ...rest] = await listArchive(db, 'ann')

    expect(rest).toEqual([])
    expect(shelf).toMatchObject({ correspondenceId: 'pair', name: 'Bob Stone', kind: 'person' })
    expect(shelf!.entries).toEqual([
      { id: FROM_ANN, direction: 'sent', from: null, postmark: '2026-11-16' },
      { id: FROM_BOB, direction: 'received', from: 'Bob Stone', postmark: '2026-11-16' },
    ])
  })

  it('counts an unopened letter and leaves out a draft and a letter on its way', async () => {
    const [shelf] = await listArchive(db, 'ann')
    const listed = JSON.stringify(shelf)

    expect(shelf!.unopened).toBe(1)
    expect(listed).not.toContain(UNOPENED)
    expect(listed).not.toContain(ON_ITS_WAY)
    expect(listed).not.toContain(DRAFT)
  })

  it('shows a writer every letter they sealed, whatever became of it', async () => {
    const [shelf] = await listArchive(db, 'bob')

    expect(shelf!.entries.filter((entry) => entry.direction === 'sent')).toHaveLength(3)
    expect(shelf!.unopened).toBe(0)
    expect(await listArchive(db, 'cal')).toEqual([])
  })
})

describe('one letter for the copy', () => {
  it("gives the reader's own key copy, and opens nothing", async () => {
    expect(await readForArchive(db, 'ann', FROM_BOB)).toEqual({
      ciphertext: CIPHERTEXT,
      wrappedKey: 'key-for-ann',
      hasPhoto: false,
    })
    expect(await readForArchive(db, 'ann', FROM_ANN)).toMatchObject({ wrappedKey: 'key-for-ann' })

    expect(await readForArchive(db, 'ann', UNOPENED)).toBeNull()
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.letterId, UNOPENED))
    expect(delivery!.openedAt).toBeNull()
  })

  it('refuses a draft, a letter on its way, and a stranger', async () => {
    expect(await readForArchive(db, 'ann', DRAFT)).toBeNull()
    expect(await readForArchive(db, 'ann', ON_ITS_WAY)).toBeNull()
    expect(await readForArchive(db, 'cal', FROM_BOB)).toBeNull()
    expect(await readForArchive(db, 'bob', ON_ITS_WAY)).toMatchObject({ wrappedKey: 'key-for-bob' })
  })
})
