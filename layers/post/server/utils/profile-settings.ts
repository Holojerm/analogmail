// Changing where and when mail arrives. Mail days and the hour change from
// tomorrow, so today's release never moves; a new city changes the time zone
// at once. Letters already posted keep the dates fixed at their postmark.

import { eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import { localParts } from '../../shared/utils/calendar'
import { isValidMailDays } from '../../shared/utils/mail-days'
import { nextRelease, pendingFrom, settle, type ReleaseState } from '../../shared/utils/release'

import { releaseStateOf, type PostDb } from './release-run'

export const mailSettingsSchema = z.object({
  mailDays: z.number().int().refine(isValidMailDays, 'Choose at least one day, Monday to Saturday'),
  deliveryHour: z.number().int().min(0).max(23),
})

const columns = (state: ReleaseState) => ({
  mailDays: state.current.mailDays,
  deliveryHour: state.current.hour,
  pendingMailDays: state.pending?.mailDays ?? null,
  pendingDeliveryHour: state.pending?.hour ?? null,
  pendingFrom: state.pending?.from ?? null,
})

async function profileOf(db: PostDb, userId: string) {
  const { postalProfiles } = tables
  const [profile] = await db.select().from(postalProfiles).where(eq(postalProfiles.userId, userId))
  return profile ?? null
}

/**
 * Asks for new mail days and hour. They wait until tomorrow. Asking for what
 * is already in force withdraws a change that was waiting.
 */
export async function changeMailSettings(
  db: PostDb,
  userId: string,
  input: z.infer<typeof mailSettingsSchema>,
  now: Date,
): Promise<'changed' | 'no-profile'> {
  const { postalProfiles } = tables
  const profile = await profileOf(db, userId)
  if (!profile) return 'no-profile'

  const settled = settle(releaseStateOf(profile), localParts(now, profile.timeZone).date)
  const same =
    settled.current.mailDays === input.mailDays && settled.current.hour === input.deliveryHour
  const state: ReleaseState = {
    ...settled,
    pending: same
      ? null
      : {
          mailDays: input.mailDays,
          hour: input.deliveryHour,
          from: pendingFrom(now, profile.timeZone),
        },
  }
  await db
    .update(postalProfiles)
    .set({ ...columns(state), nextReleaseAt: nextRelease(now, state).at, updatedAt: now })
    .where(eq(postalProfiles.userId, userId))
  return 'changed'
}

/** Moves to another city. The new time zone applies immediately. */
export async function moveToCity(
  db: PostDb,
  userId: string,
  cityId: number,
  now: Date,
): Promise<'moved' | 'unknown-city' | 'no-profile'> {
  const { cities, postalProfiles } = tables
  const profile = await profileOf(db, userId)
  if (!profile) return 'no-profile'
  const [city] = await db.select().from(cities).where(eq(cities.id, cityId))
  if (!city) return 'unknown-city'

  const state = { ...releaseStateOf(profile), zone: city.timeZone }
  await db
    .update(postalProfiles)
    .set({
      cityId: city.id,
      cityName: city.name,
      country: city.country,
      lat: city.lat,
      lng: city.lng,
      timeZone: city.timeZone,
      nextReleaseAt: nextRelease(now, state).at,
      updatedAt: now,
    })
    .where(eq(postalProfiles.userId, userId))
  return 'moved'
}
