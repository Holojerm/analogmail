import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../../../server/db/schema'

const db = drizzle(env.DB, { schema })

describe('notices', () => {
  beforeEach(async () => {
    await db.delete(schema.notices)
  })

  it('holds one notice per person per mail day, however often it is queued', async () => {
    const notice = { userId: 'user-1', mailDate: '2026-11-20' }
    await db.insert(schema.notices).values(notice).onConflictDoNothing()
    await db.insert(schema.notices).values(notice).onConflictDoNothing()
    await db.insert(schema.notices).values({ ...notice, mailDate: '2026-11-21' })
    await db.insert(schema.notices).values({ ...notice, userId: 'user-2' })

    const rows = await db.select().from(schema.notices)
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.channel === 'email' && row.state === 'pending')).toBe(true)
  })

  it('rejects a duplicate that does not ask to be ignored', async () => {
    const notice = { userId: 'user-1', mailDate: '2026-11-20' }
    await db.insert(schema.notices).values(notice)
    await expect(db.insert(schema.notices).values(notice)).rejects.toThrow()
  })
})

describe('postal profiles', () => {
  it('default to every mail day at 10 am', async () => {
    await db.delete(schema.postalProfiles)
    await db.insert(schema.postalProfiles).values({
      userId: 'user-1',
      cityName: 'Chicago',
      country: 'US',
      lat: 41.8781,
      lng: -87.6298,
      timeZone: 'America/Chicago',
    })
    const [profile] = await db.select().from(schema.postalProfiles)
    expect(profile).toMatchObject({ mailDays: 63, deliveryHour: 10, lastReleaseDate: null })
  })
})
