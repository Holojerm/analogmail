// The release run against a real D1 inside workerd.
//
// November 2026: the 16th is a Monday, the 21st a Saturday. Chicago is
// UTC-6, so its 10 am delivery is 16:00 UTC; Tokyo's is 01:00 UTC.

import { env } from 'cloudflare:test'
import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { advanceTo, rescheduleAll } from '../server/dev/advance'
import { runRelease } from '../server/utils/release-run'
import { returnToSender } from '../server/utils/returns'
import { mailDaysFromWeekdays } from '../shared/utils/mail-days'

const db = drizzle(env.DB, { schema })
const { postalProfiles, deliveries, notices, opsEvents } = schema
const utc = (iso: string) => new Date(`${iso}Z`)

const CHICAGO = {
  cityName: 'Chicago',
  country: 'US',
  lat: 41.8781,
  lng: -87.6298,
  timeZone: 'America/Chicago',
}
const MONDAY_TEN = utc('2026-11-16T16:00:00')
const TUESDAY_TEN = utc('2026-11-17T16:00:00')

const addPerson = (userId: string, overrides: Partial<typeof postalProfiles.$inferInsert> = {}) =>
  db.insert(postalProfiles).values({ userId, ...CHICAGO, nextReleaseAt: MONDAY_TEN, ...overrides })

async function post(recipientId: string, earliestDate: string) {
  const [row] = await db
    .insert(deliveries)
    .values({
      letterId: crypto.randomUUID(),
      recipientId,
      earliestDate,
      promisedDate: earliestDate,
      transitDays: 3,
    })
    .returning()
  return row!
}

const profileOf = async (userId: string) =>
  (await db.select().from(postalProfiles).where(eq(postalProfiles.userId, userId)))[0]!
const mailOf = (userId: string) =>
  db
    .select()
    .from(deliveries)
    .where(eq(deliveries.recipientId, userId))
    .orderBy(asc(deliveries.earliestDate))
const snapshot = async () => ({
  profiles: await db.select().from(postalProfiles).orderBy(asc(postalProfiles.userId)),
  deliveries: await db.select().from(deliveries).orderBy(asc(deliveries.id)),
  notices: await db.select().from(notices).orderBy(asc(notices.id)),
})

beforeEach(async () => {
  await db.delete(deliveries)
  await db.delete(notices)
  await db.delete(postalProfiles)
  await db.delete(opsEvents)
})

describe('the release run', () => {
  it('delivers three letters from two senders with one notice', async () => {
    await addPerson('ann')
    await post('ann', '2026-11-14')
    await post('ann', '2026-11-16')
    await post('ann', '2026-11-16')
    await post('ann', '2026-11-17')

    const report = await runRelease(db, MONDAY_TEN)

    expect(report).toEqual({ due: 1, delivered: 3, notices: 1, failed: 0, truncated: false })
    const mail = await mailOf('ann')
    expect(mail.map((row) => row.state)).toEqual([
      'delivered',
      'delivered',
      'delivered',
      'in_transit',
    ])
    expect(mail[0]).toMatchObject({ deliveredAt: MONDAY_TEN, mailDate: '2026-11-16' })
    expect(mail[3]!.deliveredAt).toBeNull()
    expect(await db.select().from(notices)).toMatchObject([
      { userId: 'ann', mailDate: '2026-11-16', state: 'pending' },
    ])
    expect(await profileOf('ann')).toMatchObject({
      lastReleaseDate: '2026-11-16',
      nextReleaseAt: TUESDAY_TEN,
    })
  })

  it('changes nothing when it runs a second time', async () => {
    await addPerson('ann')
    await addPerson('bob')
    await post('ann', '2026-11-16')
    await post('bob', '2026-11-18')

    await runRelease(db, utc('2026-11-16T16:05:00'))
    const first = await snapshot()
    const report = await runRelease(db, utc('2026-11-16T16:05:00'))

    expect(report).toEqual({ due: 0, delivered: 0, notices: 0, failed: 0, truncated: false })
    expect(await snapshot()).toEqual(first)
  })

  it('gives one notice even when the same day is released again', async () => {
    await addPerson('ann')
    await post('ann', '2026-11-16')
    await runRelease(db, MONDAY_TEN)
    // As if the profile write had been lost and the run retried.
    await db.update(postalProfiles).set({ lastReleaseDate: null, nextReleaseAt: MONDAY_TEN })
    await post('ann', '2026-11-16')

    await runRelease(db, utc('2026-11-16T16:15:00'))

    expect(await db.select().from(notices)).toHaveLength(1)
    const mail = await mailOf('ann')
    expect(mail.map((row) => row.state)).toEqual(['delivered', 'delivered'])
  })

  it('does nothing before the delivery hour', async () => {
    await addPerson('ann', { nextReleaseAt: null })
    await post('ann', '2026-11-16')

    const report = await runRelease(db, utc('2026-11-16T15:45:00'))

    expect(report).toMatchObject({ due: 0, delivered: 0, notices: 0 })
    expect((await mailOf('ann'))[0]!.state).toBe('in_transit')
    expect(await profileOf('ann')).toMatchObject({
      lastReleaseDate: null,
      nextReleaseAt: MONDAY_TEN,
    })
  })

  it('sends no notice on an empty day, and the day is still used up', async () => {
    await addPerson('ann')
    await runRelease(db, MONDAY_TEN)
    await post('ann', '2026-11-16')

    const later = await runRelease(db, utc('2026-11-16T20:00:00'))

    expect(later.due).toBe(0)
    expect(await db.select().from(notices)).toHaveLength(0)
    expect((await mailOf('ann'))[0]!.state).toBe('in_transit')

    await runRelease(db, TUESDAY_TEN)
    expect((await mailOf('ann'))[0]!.state).toBe('delivered')
    expect(await db.select().from(notices)).toMatchObject([{ mailDate: '2026-11-17' }])
  })

  it('catches up when it runs late the same day', async () => {
    await addPerson('ann')
    await post('ann', '2026-11-16')

    await runRelease(db, utc('2026-11-16T23:30:00'))

    expect((await mailOf('ann'))[0]!.state).toBe('delivered')
    expect(await db.select().from(notices)).toMatchObject([{ mailDate: '2026-11-16' }])
  })

  it('waits for Monday when a Saturday release slips into Sunday', async () => {
    await addPerson('ann', {
      lastReleaseDate: '2026-11-20',
      nextReleaseAt: utc('2026-11-21T16:00:00'),
    })
    await post('ann', '2026-11-21')

    const sunday = await runRelease(db, utc('2026-11-22T07:00:00'))

    expect(sunday).toMatchObject({ due: 0, delivered: 0, notices: 0 })
    expect((await mailOf('ann'))[0]!.state).toBe('in_transit')
    expect(await profileOf('ann')).toMatchObject({
      lastReleaseDate: '2026-11-20',
      nextReleaseAt: utc('2026-11-23T16:00:00'),
    })

    await runRelease(db, utc('2026-11-23T16:00:00'))
    expect(await db.select().from(notices)).toMatchObject([{ mailDate: '2026-11-23' }])
  })

  it('schedules a one-day-a-week reader for that day', async () => {
    await addPerson('ann', { mailDays: mailDaysFromWeekdays([4]), nextReleaseAt: null })

    await runRelease(db, MONDAY_TEN)

    expect((await profileOf('ann')).nextReleaseAt).toEqual(utc('2026-11-19T16:00:00'))
  })

  it("releases on the reader's calendar across the date line", async () => {
    await addPerson('yuki', {
      timeZone: 'Asia/Tokyo',
      country: 'JP',
      nextReleaseAt: utc('2026-11-17T01:00:00'),
    })
    await post('yuki', '2026-11-17')

    // Monday evening in Chicago is already Tuesday morning in Tokyo.
    await runRelease(db, utc('2026-11-17T01:00:00'))

    expect(await db.select().from(notices)).toMatchObject([
      { userId: 'yuki', mailDate: '2026-11-17' },
    ])
  })

  it('applies a pending change from its date, not before', async () => {
    await addPerson('ann', {
      pendingMailDays: 63,
      pendingDeliveryHour: 8,
      pendingFrom: '2026-11-17',
    })

    await runRelease(db, MONDAY_TEN)
    expect(await profileOf('ann')).toMatchObject({
      lastReleaseDate: '2026-11-16',
      deliveryHour: 10,
      pendingFrom: '2026-11-17',
      nextReleaseAt: utc('2026-11-17T14:00:00'),
    })

    await runRelease(db, utc('2026-11-17T14:00:00'))
    expect(await profileOf('ann')).toMatchObject({
      lastReleaseDate: '2026-11-17',
      deliveryHour: 8,
      pendingDeliveryHour: null,
      pendingFrom: null,
      nextReleaseAt: utc('2026-11-18T14:00:00'),
    })
  })

  it('parks a profile it cannot schedule for a day and carries on', async () => {
    await addPerson('ann', { timeZone: 'Mars/Olympus_Mons' })
    await addPerson('bob')
    await post('bob', '2026-11-16')

    const report = await runRelease(db, MONDAY_TEN)

    expect(report).toMatchObject({ due: 1, delivered: 1, failed: 1 })
    expect((await profileOf('ann')).nextReleaseAt).toEqual(TUESDAY_TEN)
    expect(await db.select().from(opsEvents)).toMatchObject([{ kind: 'release_profile_failed' }])
  })

  it('leaves the people over its limit for the next run', async () => {
    for (const userId of ['ann', 'bob', 'cat']) {
      await addPerson(userId)
      await post(userId, '2026-11-16')
    }

    const first = await runRelease(db, MONDAY_TEN, { limit: 2 })
    const second = await runRelease(db, utc('2026-11-16T16:15:00'), { limit: 2 })

    expect(first).toMatchObject({ due: 2, delivered: 2, truncated: true })
    expect(second).toMatchObject({ due: 1, delivered: 1, truncated: false })
    expect(await db.select().from(notices)).toHaveLength(3)
  })
})

describe('a dev clock jump', () => {
  it('runs the release at every delivery hour it passes, not only at the end', async () => {
    await addPerson('ann')
    await addPerson('yuki', {
      timeZone: 'Asia/Tokyo',
      country: 'JP',
      nextReleaseAt: utc('2026-11-17T01:00:00'),
    })
    await post('ann', '2026-11-16')
    await post('yuki', '2026-11-17')
    await post('yuki', '2026-11-18')

    // From before Ann's Monday delivery to after Yuki's Wednesday one.
    const report = await advanceTo(db, utc('2026-11-16T12:00:00'), utc('2026-11-18T12:00:00'))

    expect(report).toMatchObject({ delivered: 3, notices: 3 })
    const dates = (await db.select().from(notices)).map((row) => `${row.userId} ${row.mailDate}`)
    expect(dates.sort()).toEqual(['ann 2026-11-16', 'yuki 2026-11-17', 'yuki 2026-11-18'])
    // Wednesday noon UTC is before Ann's Wednesday delivery in Chicago.
    expect((await profileOf('ann')).lastReleaseDate).toBe('2026-11-17')
  })

  it('reschedules everyone when the clock is reset to an earlier time', async () => {
    await addPerson('ann', {
      lastReleaseDate: '2026-11-30',
      nextReleaseAt: utc('2026-12-01T16:00:00'),
    })
    await addPerson('bob', { lastReleaseDate: '2026-11-14', nextReleaseAt: null })

    await rescheduleAll(db, utc('2026-11-16T12:00:00'))

    expect(await profileOf('ann')).toMatchObject({
      lastReleaseDate: null,
      nextReleaseAt: MONDAY_TEN,
    })
    expect(await profileOf('bob')).toMatchObject({
      lastReleaseDate: '2026-11-14',
      nextReleaseAt: MONDAY_TEN,
    })
  })
})

describe('returned to sender', () => {
  beforeEach(async () => {
    await addPerson('ann', { lastReleaseDate: '2026-11-16', nextReleaseAt: TUESDAY_TEN })
    await addPerson('bob', { lastReleaseDate: '2026-11-16', nextReleaseAt: TUESDAY_TEN })
  })

  it("never reaches the recipient and arrives with the author's next release", async () => {
    const letter = await post('bob', '2026-11-17')

    expect(await returnToSender(db, letter.id, 'ann', utc('2026-11-16T20:00:00'))).toBe(true)
    await runRelease(db, TUESDAY_TEN)

    expect(await mailOf('bob')).toMatchObject([{ state: 'returned', deliveredAt: null }])
    expect(await mailOf('ann')).toMatchObject([
      { letterId: letter.letterId, kind: 'return', state: 'delivered', earliestDate: '2026-11-16' },
    ])
    expect(await db.select().from(notices)).toMatchObject([
      { userId: 'ann', mailDate: '2026-11-17' },
    ])
  })

  it('returns a letter once however often it is asked', async () => {
    const letter = await post('bob', '2026-11-17')
    const now = utc('2026-11-16T20:00:00')

    expect(await returnToSender(db, letter.id, 'ann', now)).toBe(true)
    expect(await returnToSender(db, letter.id, 'ann', now)).toBe(true)

    expect(await mailOf('ann')).toHaveLength(1)
  })

  it('refuses a delivered letter, a return and an unknown delivery', async () => {
    const letter = await post('bob', '2026-11-17')
    await runRelease(db, TUESDAY_TEN)
    const other = await post('bob', '2026-11-18')
    const now = utc('2026-11-17T20:00:00')
    await returnToSender(db, other.id, 'ann', now)
    const [comingBack] = await mailOf('ann')

    expect(await returnToSender(db, letter.id, 'ann', now)).toBe(false)
    expect(await returnToSender(db, comingBack!.id, 'bob', now)).toBe(false)
    expect(await returnToSender(db, 'no-such-delivery', 'ann', now)).toBe(false)
    expect((await mailOf('bob'))[0]!.state).toBe('delivered')
  })

  it('withholds the letter and sends it nowhere when the author is gone', async () => {
    const letter = await post('bob', '2026-11-17')

    expect(await returnToSender(db, letter.id, null, utc('2026-11-16T20:00:00'))).toBe(true)

    expect(await db.select().from(deliveries)).toMatchObject([{ state: 'returned' }])
  })
})
