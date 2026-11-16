// The gazette and the almanac: when an issue is out, what is in it, and that
// it is built from the room as it stands, so nothing deleted lingers in one.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { forgetCheckins } from '../server/utils/room-checkins'
import { registerRoomFamilies } from '../server/utils/room-families'
import { listRoomIssues, readRoomIssue } from '../server/utils/room-issues'
import { roomIssueIsOut, roomIssueLabel, roomIssuePeriod } from '../shared/utils/room-issue'
import type { RoomFamily } from '../shared/utils/room-types'

const db = drizzle(env.DB, { schema })
const { users, roomCheckins, roomPhotos } = schema

const LEES = 'aaaaaaaa-0000-4000-8000-000000000001'
const STONES = 'bbbbbbbb-0000-4000-8000-000000000002'
const lees: RoomFamily = { id: LEES, name: 'The Lees', closed: false, organiser: false }
const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day))
// Mid-November 2026: October's gazette is out, November's and the year's almanac are not.
const NOW = utc(2026, 11, 16)

const photo = (id: string, familyId: string, createdAt: Date, caption: string | null = null) => ({
  id,
  familyId,
  uploadedBy: 'ann',
  storageKey: `room/${familyId}/${id}.jpg`,
  thumbKey: `room/${familyId}/${id}.thumb.jpg`,
  sizeBytes: 1000,
  width: 800,
  height: 600,
  caption,
  createdAt,
})
const said = (userId: string, cityName: string, createdAt: Date, familyId = LEES) => ({
  familyId,
  userId,
  cityName,
  country: cityName === 'Tokyo' ? 'JP' : 'US',
  lat: 1,
  lng: 1,
  createdAt,
})

beforeEach(async () => {
  await db.delete(roomCheckins)
  await db.delete(roomPhotos)
  await db.delete(users)
  await db.insert(users).values({ id: 'ann', email: 'ann@example.com', name: 'Ann' })
  registerRoomFamilies({
    membership: async () => null,
    list: async () => [],
    members: async (_db, familyId) =>
      familyId === LEES
        ? [
            { id: 'ann', name: 'Ann' },
            { id: 'bob', name: 'Bob' },
          ]
        : [],
  })
  await db
    .insert(roomPhotos)
    .values([
      photo('oct-1', LEES, utc(2026, 10, 3), 'The plum tree'),
      photo('oct-2', LEES, utc(2026, 10, 31)),
      photo('nov-1', LEES, utc(2026, 11, 1)),
      photo('old', LEES, utc(2025, 12, 31)),
      photo('theirs', STONES, utc(2026, 10, 5)),
    ])
  await db.insert(roomCheckins).values([
    said('bob', 'Chicago', utc(2026, 10, 2)),
    said('bob', 'Chicago', utc(2026, 10, 9)),
    said('bob', 'Tokyo', utc(2026, 10, 20)),
    // Eve has left the family: what she said is in no issue.
    said('eve', 'Tokyo', utc(2026, 10, 4)),
    said('ann', 'Tokyo', utc(2026, 10, 6), STONES),
  ])
})

describe('when an issue is out', () => {
  it('names a month or a year, and nothing else', () => {
    expect(roomIssuePeriod('2026-10')).toMatchObject({ kind: 'gazette', to: utc(2026, 11, 1) })
    expect(roomIssuePeriod('2026')).toMatchObject({ kind: 'almanac', to: utc(2027, 1, 1) })
    for (const bad of ['2026-13', '2026-00', '26-10', '2026-1', 'latest', '']) {
      expect(roomIssuePeriod(bad)).toBeNull()
    }
    expect(roomIssueLabel('2026-10')).toBe('October 2026')
    expect(roomIssueLabel('2026')).toBe('2026')
  })

  it('comes out on the first instant after its period', () => {
    const october = roomIssuePeriod('2026-10')!
    expect(roomIssueIsOut(october, new Date('2026-10-31T23:59:59Z'))).toBe(false)
    expect(roomIssueIsOut(october, utc(2026, 11, 1))).toBe(true)
  })

  it('lists the finished months and years that have something in them', async () => {
    expect(await listRoomIssues(db, LEES, NOW)).toEqual({
      gazettes: [
        { id: '2026-10', photos: 2, checkins: 3 },
        { id: '2025-12', photos: 1, checkins: 0 },
      ],
      almanacs: [{ id: '2025', photos: 1, checkins: 0 }],
    })
    expect((await listRoomIssues(db, LEES, utc(2027, 1, 1))).almanacs[0]).toEqual({
      id: '2026',
      photos: 3,
      checkins: 3,
    })
  })
})

describe('what is in an issue', () => {
  it("holds that month's photos and where the family's people said they were", async () => {
    const issue = (await readRoomIssue(db, lees, '2026-10', NOW))!
    expect(issue.kind).toBe('gazette')
    expect(issue.months).toHaveLength(1)
    expect(issue.months[0]).toMatchObject({ id: '2026-10', total: 2 })
    expect(issue.months[0]!.photos.map((p) => [p.id, p.caption, p.uploaderName])).toEqual([
      ['oct-1', 'The plum tree', 'Ann'],
      ['oct-2', null, 'Ann'],
    ])
    // Saying Chicago twice is one stop; Eve, who left, and the Stones are not here.
    expect(issue.places).toEqual([
      {
        userId: 'bob',
        name: 'Bob',
        stops: [
          { city: 'Chicago', country: 'US', at: '2026-10-02T00:00:00.000Z' },
          { city: 'Tokyo', country: 'JP', at: '2026-10-20T00:00:00.000Z' },
        ],
      },
    ])
  })

  it('is not there before its time, or for a time when nothing happened', async () => {
    expect(await readRoomIssue(db, lees, '2026-11', NOW)).toBeNull()
    expect(await readRoomIssue(db, lees, '2026', NOW)).toBeNull()
    expect(await readRoomIssue(db, lees, '2026-09', NOW)).toBeNull()
    expect(await readRoomIssue(db, lees, 'latest', NOW)).toBeNull()
  })

  it('groups an almanac by month and shows a few photos of each', async () => {
    const almanac = (await readRoomIssue(db, lees, '2026', utc(2027, 1, 1)))!
    expect(almanac.kind).toBe('almanac')
    expect(almanac.months.map((month) => [month.id, month.total])).toEqual([
      ['2026-10', 2],
      ['2026-11', 1],
    ])
  })

  it('loses a photo that is deleted and a city that is taken back', async () => {
    await db.delete(roomPhotos).where(eq(roomPhotos.id, 'oct-1'))
    await forgetCheckins(db, LEES, 'bob')
    const issue = (await readRoomIssue(db, lees, '2026-10', NOW))!
    expect(issue.months[0]!.photos.map((p) => p.id)).toEqual(['oct-2'])
    expect(issue.places).toEqual([])
  })
})
