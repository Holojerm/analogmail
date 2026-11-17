// A person's postal profile: the city their mail travels to, the days it is
// delivered and the hour. Created once at sign-up; changing it is a settings
// matter with its own rules (changes wait for the next mail day).

import { and, desc, eq, gte, lt } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import { isValidMailDays } from '../../shared/utils/mail-days'
import { nextRelease } from '../../shared/utils/release'
import { searchKey } from '../../shared/utils/search-key'

import { releaseStateOf, type PostDb } from './release-run'

export const profileInputSchema = z.object({
  cityId: z.number().int().positive(),
  mailDays: z.number().int().refine(isValidMailDays, 'Choose at least one day, Monday to Saturday'),
  deliveryHour: z.number().int().min(0).max(23),
})

/** Cities whose name starts with the query, largest first. */
export async function searchCities(db: PostDb, query: string, limit = 8) {
  const { cities } = tables
  const key = searchKey(query)
  if (key.length < 2) return []
  return (
    db
      .select({
        id: cities.id,
        name: cities.name,
        region: cities.region,
        country: cities.country,
        timeZone: cities.timeZone,
      })
      .from(cities)
      // A range, not LIKE: it is what the index on search_name can serve.
      .where(and(gte(cities.searchName, key), lt(cities.searchName, `${key}￿`)))
      .orderBy(desc(cities.population))
      .limit(limit)
  )
}

export async function getProfile(db: PostDb, userId: string) {
  const { postalProfiles } = tables
  const [profile] = await db
    .select({
      // Null on a profile made before the city list was kept by id.
      cityId: postalProfiles.cityId,
      cityName: postalProfiles.cityName,
      country: postalProfiles.country,
      timeZone: postalProfiles.timeZone,
      mailDays: postalProfiles.mailDays,
      deliveryHour: postalProfiles.deliveryHour,
      // A change that is waiting, and the day it starts.
      pendingMailDays: postalProfiles.pendingMailDays,
      pendingDeliveryHour: postalProfiles.pendingDeliveryHour,
      pendingFrom: postalProfiles.pendingFrom,
    })
    .from(postalProfiles)
    .where(eq(postalProfiles.userId, userId))
  return profile ?? null
}

export type CreateProfileResult = 'created' | 'exists' | 'unknown-city'

/**
 * The place is copied from the city list, so the coordinates are always a
 * city centre and never anything the browser sent.
 */
export async function createProfile(
  db: PostDb,
  userId: string,
  input: z.infer<typeof profileInputSchema>,
  now: Date,
): Promise<CreateProfileResult> {
  const { cities, postalProfiles } = tables
  const [city] = await db.select().from(cities).where(eq(cities.id, input.cityId))
  if (!city) return 'unknown-city'

  const profile = {
    userId,
    cityId: city.id,
    cityName: city.name,
    country: city.country,
    lat: city.lat,
    lng: city.lng,
    timeZone: city.timeZone,
    mailDays: input.mailDays,
    deliveryHour: input.deliveryHour,
  }
  const state = releaseStateOf({
    ...profile,
    pendingMailDays: null,
    pendingDeliveryHour: null,
    pendingFrom: null,
    lastReleaseDate: null,
    nextReleaseAt: null,
    createdAt: now,
    updatedAt: now,
  })
  const [created] = await db
    .insert(postalProfiles)
    .values({ ...profile, nextReleaseAt: nextRelease(now, state).at })
    .onConflictDoNothing()
    .returning({ userId: postalProfiles.userId })
  return created ? 'created' : 'exists'
}
