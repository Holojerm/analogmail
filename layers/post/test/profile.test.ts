// Choosing a city at sign-up, against a real D1.

import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import {
  createProfile,
  getProfile,
  profileInputSchema,
  searchCities,
} from '../server/utils/profile'
import { mailDaysFromWeekdays } from '../shared/utils/mail-days'
import { searchKey } from '../shared/utils/search-key'

const db = drizzle(env.DB, { schema })
const { cities, postalProfiles } = schema
const utc = (iso: string) => new Date(`${iso}Z`)

const city = (id: number, name: string, country: string, population: number, more = {}) => ({
  id,
  name,
  searchName: searchKey(name),
  country,
  lat: 41.8781,
  lng: -87.6298,
  timeZone: 'America/Chicago',
  population,
  ...more,
})

beforeEach(async () => {
  await db.delete(postalProfiles)
  await db.delete(cities)
  await db
    .insert(cities)
    .values([
      city(1, 'Chicago', 'US', 2_700_000, { region: 'Illinois' }),
      city(2, 'Chico', 'US', 100_000),
      city(3, 'Chichester', 'GB', 30_000),
      city(4, 'São Paulo', 'BR', 12_000_000, { timeZone: 'America/Sao_Paulo' }),
      city(5, 'Tokyo', 'JP', 9_000_000, { lat: 35.6762, lng: 139.6503, timeZone: 'Asia/Tokyo' }),
    ])
})

describe('the city list', () => {
  it('matches the start of the name, largest city first', async () => {
    const found = await searchCities(db, 'chi')

    expect(found.map((row) => row.name)).toEqual(['Chicago', 'Chico', 'Chichester'])
    expect(found[0]).toEqual({
      id: 1,
      name: 'Chicago',
      region: 'Illinois',
      country: 'US',
      timeZone: 'America/Chicago',
    })
  })

  it('ignores case and accents', async () => {
    expect((await searchCities(db, 'SAO PA')).map((row) => row.name)).toEqual(['São Paulo'])
    expect((await searchCities(db, 'são')).map((row) => row.name)).toEqual(['São Paulo'])
  })

  it('returns nothing for a query too short to mean a city, or one that matches none', async () => {
    expect(await searchCities(db, 'c')).toEqual([])
    expect(await searchCities(db, '  ')).toEqual([])
    expect(await searchCities(db, 'zz')).toEqual([])
    expect(await searchCities(db, "ch%' OR 1=1")).toEqual([])
  })
})

describe('a postal profile', () => {
  const monday = utc('2026-11-16T12:00:00')
  const input = { cityId: 5, mailDays: 63, deliveryHour: 10 }

  it('takes its place and time zone from the city, and schedules the first release', async () => {
    expect(await createProfile(db, 'yuki', input, monday)).toBe('created')

    const [row] = await db.select().from(postalProfiles)
    expect(row).toMatchObject({
      userId: 'yuki',
      cityId: 5,
      cityName: 'Tokyo',
      country: 'JP',
      lat: 35.6762,
      lng: 139.6503,
      timeZone: 'Asia/Tokyo',
      // Monday noon UTC is 9 pm in Tokyo. Today's 10 am has passed, so the
      // first run finds an empty release due and moves on to Tuesday.
      nextReleaseAt: utc('2026-11-16T01:00:00'),
      lastReleaseDate: null,
    })
    expect(await getProfile(db, 'yuki')).toEqual({
      cityName: 'Tokyo',
      country: 'JP',
      timeZone: 'Asia/Tokyo',
      mailDays: 63,
      deliveryHour: 10,
      pendingMailDays: null,
      pendingDeliveryHour: null,
      pendingFrom: null,
    })
  })

  it('is chosen once', async () => {
    await createProfile(db, 'yuki', input, monday)

    expect(await createProfile(db, 'yuki', { ...input, cityId: 1 }, monday)).toBe('exists')
    expect((await getProfile(db, 'yuki'))!.cityName).toBe('Tokyo')
  })

  it('needs a city from the list', async () => {
    expect(await createProfile(db, 'yuki', { ...input, cityId: 999 }, monday)).toBe('unknown-city')
    expect(await getProfile(db, 'yuki')).toBeNull()
  })

  it('schedules a one-day-a-week reader for that day', async () => {
    const thursdays = { cityId: 1, mailDays: mailDaysFromWeekdays([4]), deliveryHour: 8 }

    await createProfile(db, 'ann', thursdays, monday)

    const [row] = await db.select().from(postalProfiles)
    expect(row!.nextReleaseAt).toEqual(utc('2026-11-19T14:00:00'))
  })

  it('refuses Sunday, no days at all, and an hour that does not exist', () => {
    const parse = (more: object) => profileInputSchema.safeParse({ ...input, ...more }).success

    expect(parse({})).toBe(true)
    expect(parse({ mailDays: 0 })).toBe(false)
    expect(parse({ mailDays: 64 })).toBe(false)
    expect(parse({ deliveryHour: 24 })).toBe(false)
    expect(parse({ cityId: 1.5 })).toBe(false)
  })
})
