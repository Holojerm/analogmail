// Where everyone in a family says they are. A check-in is a city picked from
// the app's own list, said to one family. There are no reminders: nobody is
// asked whether they are still somewhere, and nobody can ask on their behalf.

import { and, desc, eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import type { RoomFamily, RoomWhereabouts } from '../../shared/utils/room-types'
import { roomMembers, type RoomDb } from './room-families'

export type CheckInResult = 'done' | 'closed' | 'unknown-city'

export async function checkIn(
  db: RoomDb,
  family: RoomFamily,
  userId: string,
  cityId: number,
  now: Date,
): Promise<CheckInResult> {
  const { cities, roomCheckins } = tables
  if (family.closed) return 'closed'
  const [city] = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1)
  if (!city) return 'unknown-city'
  await db.insert(roomCheckins).values({
    familyId: family.id,
    userId,
    cityName: city.name,
    country: city.country,
    lat: city.lat,
    lng: city.lng,
    createdAt: now,
  })
  return 'done'
}

/**
 * Each person in the family now, with where they last said they were. Someone
 * who has left is not listed, whatever they said while they were in it.
 */
export async function whereabouts(db: RoomDb, familyId: string): Promise<RoomWhereabouts[]> {
  const { roomCheckins } = tables
  const members = await roomMembers(db, familyId)
  const rows = await db
    .select()
    .from(roomCheckins)
    .where(eq(roomCheckins.familyId, familyId))
    .orderBy(desc(roomCheckins.createdAt), desc(roomCheckins.id))
  const latest = new Map<string, (typeof rows)[number]>()
  for (const row of rows) if (!latest.has(row.userId)) latest.set(row.userId, row)
  return members
    .map((member) => {
      const last = latest.get(member.id)
      return {
        userId: member.id,
        name: member.name,
        city: last?.cityName ?? null,
        country: last?.country ?? null,
        at: last?.createdAt.toISOString() ?? null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Takes back everything a person said to one family about where they were. */
export async function forgetCheckins(db: RoomDb, familyId: string, userId: string): Promise<void> {
  const { roomCheckins } = tables
  await db
    .delete(roomCheckins)
    .where(and(eq(roomCheckins.familyId, familyId), eq(roomCheckins.userId, userId)))
}
