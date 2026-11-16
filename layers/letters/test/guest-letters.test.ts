// Guest letters against a real D1: a keeper makes the write link, a letter
// through it arrives sealed on the mantel's next mail day, and the link's
// limits hold: closing day, cap, replacement.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { runRelease } from '#layers/post/server/utils/release-run'

import {
  createGuestLink,
  guestLinkFor,
  postGuestLetter,
  viewGuestLink,
} from '../server/utils/guest-letters'
import { listKeptMantel, openKeptLetter } from '../server/utils/kept-mantel'
import { guestLetterSchema, guestLinkIdSchema } from '../shared/utils/guest'

const db = drizzle(env.DB, { schema })
const {
  users,
  userKeys,
  postalProfiles,
  notices,
  mantels,
  mantelKeepers,
  correspondences,
  correspondenceMembers,
  letters,
  letterKeys,
  deliveries,
  guestLinks,
} = schema

const WEDDING = 'bbbbbbbb-0000-4000-8000-000000000002'
const CHILD = 'aaaaaaaa-0000-4000-8000-000000000001'
const NOW = new Date('2026-11-16T20:00:00Z')
const DATES = { opensOn: '2027-11-14', closesOn: '2026-12-16' }
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`
const CHICAGO = {
  cityName: 'Chicago',
  country: 'US',
  lat: 41.85,
  lng: -87.65,
  timeZone: 'America/Chicago',
}
const letter = (n: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  ciphertext: CIPHERTEXT,
  wrappedKey: 'key-for-the-mantel',
})

async function link(): Promise<string> {
  const made = await createGuestLink(db, 'maya', { mantelId: WEDDING, ...DATES }, NOW)
  if (made.status !== 'created') throw new Error(made.status)
  return made.id
}

beforeEach(async () => {
  for (const table of [
    notices,
    deliveries,
    letterKeys,
    letters,
    guestLinks,
    correspondenceMembers,
    correspondences,
    mantelKeepers,
    mantels,
    postalProfiles,
    userKeys,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const id of ['maya', 'theo', 'eve']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
  }
  await db.insert(mantels).values([
    { id: WEDDING, kind: 'anniversary', name: 'Maya and Theo', publicKey: 'wedding-key' },
    { id: CHILD, kind: 'child', name: 'Leo', publicKey: 'leo-key' },
  ])
  await db.insert(mantelKeepers).values([
    { mantelId: WEDDING, userId: 'maya', role: 'partner' },
    { mantelId: CHILD, userId: 'maya', role: 'guardian' },
  ])
  await db.insert(postalProfiles).values({ userId: WEDDING, ...CHICAGO })
})

describe('making the write link', () => {
  it('is for keepers of an anniversary mantel that has its post', async () => {
    const input = { mantelId: WEDDING, ...DATES }
    expect(await createGuestLink(db, 'eve', input, NOW)).toEqual({ status: 'not-keeper' })
    expect(await createGuestLink(db, 'maya', { ...input, mantelId: CHILD }, NOW)).toEqual({
      status: 'not-anniversary',
    })
    await db.delete(postalProfiles)
    expect(await createGuestLink(db, 'maya', input, NOW)).toEqual({ status: 'needs-post' })
  })

  it('needs writing to close today or later, and the letters to open after that', async () => {
    const make = (dates: typeof DATES) =>
      createGuestLink(db, 'maya', { mantelId: WEDDING, ...dates }, NOW)
    expect((await make({ opensOn: '2027-11-14', closesOn: '2026-11-15' })).status).toBe('bad-dates')
    expect((await make({ opensOn: '2026-12-16', closesOn: '2026-12-16' })).status).toBe('bad-dates')
    expect((await make({ opensOn: '2200-01-01', closesOn: '2026-12-16' })).status).toBe('bad-dates')
    expect((await make(DATES)).status).toBe('created')
  })

  it('gives an unguessable id, and tells its holder only what the page needs', async () => {
    const id = await link()
    expect(guestLinkIdSchema.safeParse(id).success).toBe(true)
    expect(await viewGuestLink(db, id, NOW)).toEqual({
      status: 'open',
      mantelId: WEDDING,
      mantelName: 'Maya and Theo',
      publicKey: 'wedding-key',
      ...DATES,
    })
    expect(await viewGuestLink(db, 'A'.repeat(22), NOW)).toEqual({ status: 'unknown' })
  })
})

describe('a guest letter', () => {
  it('needs only ciphertext and a key wrapped to the mantel', () => {
    const sent = {
      link: 'A'.repeat(22),
      ...letter(1),
      wrappedKey: `v1.${'P'.repeat(87)}.${'I'.repeat(16)}.${'W'.repeat(64)}`,
    }
    expect(guestLetterSchema.safeParse(sent).success).toBe(true)
    expect(guestLetterSchema.safeParse({ ...sent, link: 'short' }).success).toBe(false)
  })

  it('is final at once, has no author, and is sealed until the opening day', async () => {
    const id = await link()
    expect(await postGuestLetter(db, id, letter(1), NOW)).toEqual({
      status: 'posted',
      opensOn: DATES.opensOn,
    })
    expect(await postGuestLetter(db, id, letter(1), NOW)).toEqual({ status: 'exists' })

    const [row] = await db.select().from(letters)
    expect(row).toMatchObject({
      authorId: null,
      origin: 'guest',
      guestLinkId: id,
      opensOn: DATES.opensOn,
      postmarkDate: '2026-11-16',
    })
    expect(row?.sealedAt).toEqual(NOW)
    expect(await db.select().from(letterKeys)).toMatchObject([{ userId: WEDDING }])
    expect(await db.select().from(deliveries)).toMatchObject([
      { recipientId: WEDDING, state: 'in_transit', transitDays: 0 },
    ])
  })

  it('arrives on the next mail day and stays sealed for its keepers', async () => {
    const id = await link()
    await postGuestLetter(db, id, letter(1), NOW)
    expect(await listKeptMantel(db, 'maya', WEDDING, NOW)).toEqual([])

    for (let day = 17; day <= 19; day += 1) {
      await runRelease(db, new Date(`2026-11-${day}T16:30:00Z`))
    }
    const later = new Date('2026-11-20T18:00:00Z')
    expect(await listKeptMantel(db, 'maya', WEDDING, later)).toMatchObject([
      { guest: true, name: null, sealed: true, opensOn: DATES.opensOn },
    ])
    expect(await openKeptLetter(db, 'maya', WEDDING, letter(1).id, later)).toMatchObject({
      sealed: true,
    })
    const anniversary = new Date('2027-11-14T18:00:00Z')
    expect(await openKeptLetter(db, 'maya', WEDDING, letter(1).id, anniversary)).toMatchObject({
      sealed: false,
      wrappedKey: 'key-for-the-mantel',
    })
  })
})

describe("the link's limits", () => {
  it('stops taking letters after its closing day, on the mantel calendar', async () => {
    const id = await link()
    const lastEvening = new Date('2026-12-17T05:00:00Z')
    const nextMorning = new Date('2026-12-17T07:00:00Z')
    expect((await postGuestLetter(db, id, letter(1), lastEvening)).status).toBe('posted')
    expect((await postGuestLetter(db, id, letter(2), nextMorning)).status).toBe('closed')
    expect(await viewGuestLink(db, id, nextMorning)).toEqual({ status: 'closed' })
  })

  it('stops at its cap', async () => {
    const id = await link()
    await db.update(guestLinks).set({ maxLetters: 2 }).where(eq(guestLinks.id, id))
    expect((await postGuestLetter(db, id, letter(1), NOW)).status).toBe('posted')
    expect((await postGuestLetter(db, id, letter(2), NOW)).status).toBe('posted')
    expect((await postGuestLetter(db, id, letter(3), NOW)).status).toBe('closed')
    expect(await guestLinkFor(db, 'maya', WEDDING)).toMatchObject({ letters: 2, maxLetters: 2 })
    expect(await guestLinkFor(db, 'eve', WEDDING)).toBeNull()
  })

  it('can be replaced: the old address stops, its letters stay', async () => {
    const first = await link()
    await postGuestLetter(db, first, letter(1), NOW)
    const second = await link()

    expect(second).not.toBe(first)
    expect((await postGuestLetter(db, first, letter(2), NOW)).status).toBe('closed')
    expect((await postGuestLetter(db, second, letter(3), NOW)).status).toBe('posted')
    expect(await db.select().from(letters)).toHaveLength(2)
    expect(await db.select().from(correspondences)).toHaveLength(1)
  })
})
