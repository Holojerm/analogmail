// Changing mail days, the hour and the city against a real D1: a change to
// days or hour waits for tomorrow, a move changes the zone at once.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { getProfile } from '../server/utils/profile'
import { changeMailSettings, moveToCity } from '../server/utils/profile-settings'
import { ALL_MAIL_DAYS, weekdaysFromMailDays } from '../shared/utils/mail-days'

const db = drizzle(env.DB, { schema })
const { postalProfiles, cities } = schema

// Monday 16 November 2026, noon in Chicago: today's 10 am release has passed.
const MONDAY_NOON = new Date('2026-11-16T18:00:00Z')
const SATURDAY_ONLY = 0b100000

const row = async () =>
  (await db.select().from(postalProfiles).where(eq(postalProfiles.userId, 'ann')))[0]!

beforeEach(async () => {
  await db.delete(postalProfiles)
  await db.delete(cities)
  await db.insert(cities).values({
    id: 1850147,
    name: 'Tokyo',
    searchName: 'tokyo',
    country: 'JP',
    lat: 35.69,
    lng: 139.69,
    timeZone: 'Asia/Tokyo',
  })
  await db.insert(postalProfiles).values({
    userId: 'ann',
    cityName: 'Chicago',
    country: 'US',
    lat: 41.85,
    lng: -87.65,
    timeZone: 'America/Chicago',
    mailDays: ALL_MAIL_DAYS,
    deliveryHour: 10,
    lastReleaseDate: '2026-11-16',
  })
})

describe('mail days and hour', () => {
  it('wait until tomorrow, and the next release already follows them', async () => {
    expect(
      await changeMailSettings(
        db,
        'ann',
        { mailDays: SATURDAY_ONLY, deliveryHour: 8 },
        MONDAY_NOON,
      ),
    ).toBe('changed')

    const profile = await row()
    expect(profile).toMatchObject({
      mailDays: ALL_MAIL_DAYS,
      deliveryHour: 10,
      pendingMailDays: SATURDAY_ONLY,
      pendingDeliveryHour: 8,
      pendingFrom: '2026-11-17',
    })
    // Saturday 21 November, 8 am in Chicago.
    expect(profile.nextReleaseAt?.toISOString()).toBe('2026-11-21T14:00:00.000Z')
    expect(await getProfile(db, 'ann')).toMatchObject({ pendingFrom: '2026-11-17' })
  })

  it('are withdrawn by asking for what is already in force', async () => {
    await changeMailSettings(db, 'ann', { mailDays: SATURDAY_ONLY, deliveryHour: 8 }, MONDAY_NOON)
    await changeMailSettings(db, 'ann', { mailDays: ALL_MAIL_DAYS, deliveryHour: 10 }, MONDAY_NOON)

    const profile = await row()
    expect(profile).toMatchObject({ pendingMailDays: null, pendingFrom: null })
    // Tuesday 17 November, 10 am in Chicago.
    expect(profile.nextReleaseAt?.toISOString()).toBe('2026-11-17T16:00:00.000Z')
  })

  it('need a profile', async () => {
    expect(
      await changeMailSettings(
        db,
        'bob',
        { mailDays: ALL_MAIL_DAYS, deliveryHour: 9 },
        MONDAY_NOON,
      ),
    ).toBe('no-profile')
  })
})

describe('moving city', () => {
  it('changes the place and the time zone at once, and never releases a day twice', async () => {
    expect(await moveToCity(db, 'ann', 1850147, MONDAY_NOON)).toBe('moved')

    const profile = await row()
    expect(profile).toMatchObject({ cityName: 'Tokyo', country: 'JP', timeZone: 'Asia/Tokyo' })
    // It is already Tuesday 17 November in Tokyo, 3 am: mail comes at 10 that morning.
    expect(profile.nextReleaseAt?.toISOString()).toBe('2026-11-17T01:00:00.000Z')
    expect(await moveToCity(db, 'ann', 42, MONDAY_NOON)).toBe('unknown-city')
  })
})

describe('listing mail days', () => {
  it('turns a mask back into weekdays', () => {
    expect(weekdaysFromMailDays(ALL_MAIL_DAYS)).toEqual([1, 2, 3, 4, 5, 6])
    expect(weekdaysFromMailDays(SATURDAY_ONLY)).toEqual([6])
  })
})
