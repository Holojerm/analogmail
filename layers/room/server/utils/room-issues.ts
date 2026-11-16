// Builds a gazette or an almanac from the room as it stands when it is read.
// Nothing is stored for an issue: a photo deleted later, or a check-in taken
// back, is gone from every issue too. Someone who has left the family is not
// named in where people were, the same as on the whereabouts page.

import { and, asc, eq, gte, lt, sql } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import {
  ROOM_ALMANAC_PHOTOS_A_MONTH,
  ROOM_GAZETTE_PHOTOS,
  roomIssueIsOut,
  roomIssuePeriod,
  roomMonthOf,
  type RoomIssue,
  type RoomIssueMonth,
  type RoomIssueSummary,
} from '../../shared/utils/room-issue'
import type { RoomFamily } from '../../shared/utils/room-types'
import { roomMembers, type RoomDb } from './room-families'

type Counts = Map<string, { photos: number; checkins: number }>

async function monthCounts(db: RoomDb, familyId: string, memberIds: string[]): Promise<Counts> {
  const { roomCheckins, roomPhotos } = tables
  const counts: Counts = new Map()
  const at = (month: string) => {
    const found = counts.get(month) ?? { photos: 0, checkins: 0 }
    counts.set(month, found)
    return found
  }
  const photoMonth = sql<string>`strftime('%Y-%m', ${roomPhotos.createdAt}, 'unixepoch')`
  const photos = await db
    .select({ month: photoMonth, count: sql<number>`count(*)` })
    .from(roomPhotos)
    .where(eq(roomPhotos.familyId, familyId))
    .groupBy(photoMonth)
  for (const row of photos) at(row.month).photos = row.count

  const checkins = await db
    .select({ userId: roomCheckins.userId, createdAt: roomCheckins.createdAt })
    .from(roomCheckins)
    .where(eq(roomCheckins.familyId, familyId))
  for (const row of checkins) {
    if (memberIds.includes(row.userId)) at(roomMonthOf(row.createdAt)).checkins += 1
  }
  return counts
}

/** Every issue that is out and has something in it, newest first. */
export async function listRoomIssues(
  db: RoomDb,
  familyId: string,
  now: Date,
): Promise<{ gazettes: RoomIssueSummary[]; almanacs: RoomIssueSummary[] }> {
  const members = await roomMembers(db, familyId)
  const counts = await monthCounts(
    db,
    familyId,
    members.map((member) => member.id),
  )
  const years = new Map<string, RoomIssueSummary>()
  const gazettes: RoomIssueSummary[] = []
  for (const [month, count] of counts) {
    const period = roomIssuePeriod(month)
    if (period && roomIssueIsOut(period, now)) gazettes.push({ id: month, ...count })
    const year = month.slice(0, 4)
    const total = years.get(year) ?? { id: year, photos: 0, checkins: 0 }
    total.photos += count.photos
    total.checkins += count.checkins
    years.set(year, total)
  }
  const newestFirst = (a: RoomIssueSummary, b: RoomIssueSummary) => b.id.localeCompare(a.id)
  return {
    gazettes: gazettes.toSorted(newestFirst),
    almanacs: [...years.values()]
      .filter((year) => roomIssueIsOut(roomIssuePeriod(year.id)!, now))
      .toSorted(newestFirst),
  }
}

/** One issue, or null when it is not out yet or nothing happened in its period. */
export async function readRoomIssue(
  db: RoomDb,
  family: RoomFamily,
  id: string,
  now: Date,
): Promise<RoomIssue | null> {
  const { roomCheckins, roomPhotos, users } = tables
  const period = roomIssuePeriod(id)
  if (!period || !roomIssueIsOut(period, now)) return null

  const rows = await db
    .select({ photo: roomPhotos, uploaderName: users.name })
    .from(roomPhotos)
    .leftJoin(users, eq(users.id, roomPhotos.uploadedBy))
    .where(
      and(
        eq(roomPhotos.familyId, family.id),
        gte(roomPhotos.createdAt, period.from),
        lt(roomPhotos.createdAt, period.to),
      ),
    )
    .orderBy(asc(roomPhotos.createdAt), asc(roomPhotos.id))
  const shown = period.kind === 'gazette' ? ROOM_GAZETTE_PHOTOS : ROOM_ALMANAC_PHOTOS_A_MONTH
  const months = new Map<string, RoomIssueMonth>()
  for (const { photo, uploaderName } of rows) {
    const month = roomMonthOf(photo.createdAt)
    const group = months.get(month) ?? { id: month, total: 0, photos: [] }
    months.set(month, group)
    group.total += 1
    if (group.photos.length < shown) {
      group.photos.push({
        id: photo.id,
        albumId: photo.albumId,
        caption: photo.caption,
        uploadedBy: photo.uploadedBy,
        uploaderName,
        width: photo.width,
        height: photo.height,
        createdAt: photo.createdAt.toISOString(),
      })
    }
  }

  const members = await roomMembers(db, family.id)
  const said = await db
    .select()
    .from(roomCheckins)
    .where(
      and(
        eq(roomCheckins.familyId, family.id),
        gte(roomCheckins.createdAt, period.from),
        lt(roomCheckins.createdAt, period.to),
      ),
    )
    .orderBy(asc(roomCheckins.createdAt), asc(roomCheckins.id))
  const places = members
    .map((member) => ({
      userId: member.id,
      name: member.name,
      stops: said
        .filter((row) => row.userId === member.id)
        .map((row) => ({
          city: row.cityName,
          country: row.country,
          at: row.createdAt.toISOString(),
        }))
        // Saying the same city twice in a row is one stop.
        .filter((stop, index, all) => index === 0 || all[index - 1]!.city !== stop.city),
    }))
    .filter((person) => person.stops.length > 0)
    .toSorted((a, b) => a.name.localeCompare(b.name))

  if (months.size === 0 && places.length === 0) return null
  return { family, id, kind: period.kind, months: [...months.values()], places }
}
