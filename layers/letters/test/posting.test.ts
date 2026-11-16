// Drafts, sealing and recall against a real D1: what sealing fixes, when a
// letter can still be taken back, and that the writer's desk never shows
// more than the postmark allows.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { discardDraft, ownLetter, saveDraft } from '../server/utils/drafts'
import { listDesk, planSeal, recallLetter, sealLetter } from '../server/utils/posting'

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

// Monday 16 November 2026, 3 pm in New York.
const MONDAY_3PM = new Date('2026-11-16T20:00:00Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (ms: number) => new Date(MONDAY_3PM.getTime() + ms)

const LETTER = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`
const KEY_FOR = (who: string) => `wrapped-for-${who}`

const NEW_YORK = {
  cityName: 'New York',
  country: 'US',
  lat: 40.71,
  lng: -74.01,
  timeZone: 'America/New_York',
}
const CHICAGO = {
  cityName: 'Chicago',
  country: 'US',
  lat: 41.85,
  lng: -87.65,
  timeZone: 'America/Chicago',
}

async function draft(id = LETTER, author = 'ann') {
  return saveDraft(
    db,
    author,
    { id, correspondenceId: 'pair', ciphertext: CIPHERTEXT, wrappedKey: KEY_FOR(author) },
    MONDAY_3PM,
  )
}

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
  for (const id of ['ann', 'bob', 'eve']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
  }
  await db.insert(people).values({ userId: 'bob', displayName: 'Bob Stone' })
  await db.insert(postalProfiles).values([
    { userId: 'ann', ...NEW_YORK },
    { userId: 'bob', ...CHICAGO },
  ])
  await db.insert(correspondences).values({ id: 'pair' })
  await db.insert(correspondenceMembers).values([
    { correspondenceId: 'pair', userId: 'ann' },
    { correspondenceId: 'pair', userId: 'bob' },
  ])
})

describe('drafts', () => {
  it('are created on the first save with only the author’s key, and replaced after', async () => {
    expect(await draft()).toBe('saved')
    expect((await db.select().from(letterKeys)).map((k) => k.userId)).toEqual(['ann'])

    const next = `v1.${'C'.repeat(16)}.${'D'.repeat(40)}`
    await saveDraft(
      db,
      'ann',
      { id: LETTER, correspondenceId: 'pair', ciphertext: next, wrappedKey: 'ignored' },
      at(HOUR),
    )
    const mine = await ownLetter(db, 'ann', LETTER)
    expect(mine).toMatchObject({ ciphertext: next, wrappedKey: KEY_FOR('ann'), sealedAt: null })
    expect(await db.select().from(letters)).toHaveLength(1)
  })

  it('belong to their author and to an open correspondence', async () => {
    expect(await draft(LETTER, 'eve')).toBe('closed')
    await draft()
    expect(await draft(LETTER, 'bob')).toBe('not-yours')
    expect(await ownLetter(db, 'bob', LETTER)).toBeNull()
    expect(await discardDraft(db, 'bob', LETTER)).toBe(false)
    expect(await discardDraft(db, 'ann', LETTER)).toBe(true)
    expect(await db.select().from(letters)).toHaveLength(0)
    expect(await db.select().from(letterKeys)).toHaveLength(0)
  })
})

describe('sealing', () => {
  it('plans New York to Chicago on a Monday afternoon as collected at 5 and arriving Friday', async () => {
    const plan = await planSeal(db, 'ann', 'pair', MONDAY_3PM)
    if (typeof plan === 'string') throw new Error(plan)

    expect(plan).toMatchObject({
      recipientId: 'bob',
      recipientName: 'Bob Stone',
      recipientPublicKey: 'public-key-of-bob',
      senderZone: 'America/New_York',
    })
    expect(plan.posting.at.toISOString()).toBe('2026-11-16T22:00:00.000Z')
    expect(plan.posting).toMatchObject({
      postmark: '2026-11-16',
      transitDays: 4,
      promisedDate: '2026-11-20',
    })
    // After 5 pm it is tomorrow's post.
    const late = await planSeal(db, 'ann', 'pair', at(3 * HOUR))
    expect(typeof late !== 'string' && late.posting.promisedDate).toBe('2026-11-21')
  })

  it('gives the recipient their key and a delivery with fixed dates, once', async () => {
    await draft()
    const sealed = await sealLetter(db, 'ann', LETTER, KEY_FOR('bob'), MONDAY_3PM)

    expect(sealed).toMatchObject({ status: 'sealed', posting: { promisedDate: '2026-11-20' } })
    expect((await db.select().from(letterKeys)).map((k) => k.userId).sort()).toEqual(['ann', 'bob'])
    const [delivery] = await db.select().from(deliveries)
    expect(delivery).toMatchObject({
      letterId: LETTER,
      recipientId: 'bob',
      kind: 'letter',
      state: 'in_transit',
      earliestDate: '2026-11-20',
      promisedDate: '2026-11-20',
      transitDays: 4,
    })

    expect((await sealLetter(db, 'ann', LETTER, KEY_FOR('bob'), at(DAY))).status).toBe(
      'already-sealed',
    )
    expect(await draft()).toBe('sealed')
    expect(await db.select().from(deliveries)).toHaveLength(1)
  })

  it('refuses a letter that is not the sender’s, or a reader who is not set up', async () => {
    await draft()
    expect((await sealLetter(db, 'bob', LETTER, KEY_FOR('bob'), MONDAY_3PM)).status).toBe(
      'not-yours',
    )
    await db.delete(postalProfiles).where(eq(postalProfiles.userId, 'bob'))
    expect((await sealLetter(db, 'ann', LETTER, KEY_FOR('bob'), MONDAY_3PM)).status).toBe(
      'recipient-not-ready',
    )
    await db.update(correspondences).set({ closedAt: MONDAY_3PM, closedBy: 'bob' })
    expect((await sealLetter(db, 'ann', LETTER, KEY_FOR('bob'), MONDAY_3PM)).status).toBe('closed')
    expect(await db.select().from(deliveries)).toHaveLength(0)
  })
})

describe('recall', () => {
  it('turns a sealed letter back into a draft until it is collected', async () => {
    await draft()
    await sealLetter(db, 'ann', LETTER, KEY_FOR('bob'), MONDAY_3PM)

    expect(await recallLetter(db, 'bob', LETTER, at(HOUR))).toBe('not-yours')
    expect(await recallLetter(db, 'ann', LETTER, at(HOUR))).toBe('recalled')
    expect(await db.select().from(deliveries)).toHaveLength(0)
    expect((await db.select().from(letterKeys)).map((k) => k.userId)).toEqual(['ann'])
    expect((await ownLetter(db, 'ann', LETTER))?.sealedAt).toBeNull()
    expect(await recallLetter(db, 'ann', LETTER, at(HOUR))).toBe('not-sealed')
    // It can be changed and sealed again.
    expect(await draft()).toBe('saved')
  })

  it('is refused from 5 pm, and the letter is untouched', async () => {
    await draft()
    await sealLetter(db, 'ann', LETTER, KEY_FOR('bob'), MONDAY_3PM)

    expect(await recallLetter(db, 'ann', LETTER, at(2 * HOUR))).toBe('too-late')
    expect(await db.select().from(deliveries)).toHaveLength(1)
    expect((await db.select().from(letterKeys)).length).toBe(2)
  })
})

describe('the writer’s desk', () => {
  it('shows a draft, then the wait for pickup, then transit, then only the postmark', async () => {
    await draft()
    expect((await listDesk(db, 'ann', MONDAY_3PM)).letters[0]).toMatchObject({
      id: LETTER,
      to: 'Bob Stone',
      status: { kind: 'draft' },
    })

    await sealLetter(db, 'ann', LETTER, KEY_FOR('bob'), MONDAY_3PM)
    const status = async (ms: number) => (await listDesk(db, 'ann', at(ms))).letters[0]?.status
    expect(await status(HOUR)).toEqual({
      kind: 'awaiting_pickup',
      pickupAt: '2026-11-16T22:00:00.000Z',
      arrives: '2026-11-20',
    })
    expect(await status(DAY)).toEqual({ kind: 'in_transit', arrives: '2026-11-20' })
    expect(await status(5 * DAY)).toEqual({ kind: 'posted', postmark: '2026-11-16' })
  })

  it('says the same whether or not the letter was delivered or opened', async () => {
    await draft()
    await sealLetter(db, 'ann', LETTER, KEY_FOR('bob'), MONDAY_3PM)
    const before = JSON.stringify(await listDesk(db, 'ann', at(4 * DAY)))

    await db.update(deliveries).set({
      state: 'delivered',
      deliveredAt: at(4 * DAY - HOUR),
      mailDate: '2026-11-20',
      openedAt: at(4 * DAY - HOUR / 2),
    })
    expect(JSON.stringify(await listDesk(db, 'ann', at(4 * DAY)))).toBe(before)
    expect(await listDesk(db, 'bob', at(4 * DAY))).toEqual({
      zone: 'America/Chicago',
      letters: [],
    })
  })
})
