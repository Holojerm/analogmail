// The family room against a real D1 and bucket: every photo and album belongs
// to one family, a member of another family reaches none of it, and only
// whoever added something, or the organiser, changes or removes it.

import { env } from 'cloudflare:test'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { clearExtensionsForTest, getAccountContributors } from '#server/utils/extensions'

import { checkIn, forgetCheckins, whereabouts } from '../server/utils/room-checkins'
import { registerRoomExtensions } from '../server/utils/room-extensions'
import {
  clearRoomFamiliesForTest,
  registerRoomFamilies,
  roomFamiliesOf,
  roomFamily,
} from '../server/utils/room-families'
import {
  addRoomPhoto,
  createRoomAlbum,
  decodeRoomCursor,
  deleteRoomAlbum,
  deleteRoomPhoto,
  encodeRoomCursor,
  findRoomPhoto,
  isJpeg,
  listRoomAlbums,
  listRoomPhotos,
  renameRoomAlbum,
  roomUsage,
  updateRoomPhoto,
  type RoomStore,
} from '../server/utils/room-photos'
import { ROOM_FAMILY_BYTES_MAX, type RoomFamily } from '../shared/utils/room-types'

const db = drizzle(env.DB, { schema })
const { users, cities, roomAlbums, roomCheckins, roomPhotos } = schema

const LEES = 'aaaaaaaa-0000-4000-8000-000000000001'
const STONES = 'bbbbbbbb-0000-4000-8000-000000000002'
const NOW = new Date('2026-11-16T20:00:00Z')
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const THUMB = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9])

const lees = (organiser = false): RoomFamily => ({
  id: LEES,
  name: 'The Lees',
  closed: false,
  organiser,
})
const stones: RoomFamily = { id: STONES, name: 'The Stones', closed: false, organiser: true }
const store: RoomStore = {
  put: async (key, bytes) => void (await env.BLOB.put(key, bytes)),
  remove: async (keys) => void (await env.BLOB.delete(keys)),
}
const stored = async () => (await env.BLOB.list()).objects.map((object) => object.key).toSorted()
const photo = { full: JPEG, thumb: THUMB, width: 800, height: 600 }

async function add(family: RoomFamily, who: string, at = NOW, albumId?: string) {
  const result = await addRoomPhoto(
    db,
    store,
    family,
    { id: who, name: who },
    { ...photo, albumId },
    at,
  )
  if (result.status !== 'added') throw new Error(result.status)
  return result.photo
}

beforeEach(async () => {
  await db.delete(roomCheckins)
  await db.delete(roomPhotos)
  await db.delete(roomAlbums)
  await db.delete(users)
  for (const object of (await env.BLOB.list()).objects) await env.BLOB.delete(object.key)
  for (const id of ['ann', 'bob', 'eve']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: `${id} name` })
  }
})

describe('who is in a room', () => {
  beforeEach(() => clearRoomFamiliesForTest())

  it('is nobody until something says who is in a family', async () => {
    expect(await roomFamily(db, 'ann', LEES)).toBeNull()
    expect(await roomFamiliesOf(db, 'ann')).toEqual([])
  })

  it('is whoever the registered source says, and nothing more', async () => {
    registerRoomFamilies({
      membership: async (_db, userId, familyId) =>
        userId === 'ann' && familyId === LEES ? lees(true) : null,
      list: async (_db, userId) => (userId === 'ann' ? [lees(true)] : []),
      members: async () => [],
    })
    expect(await roomFamily(db, 'ann', LEES)).toMatchObject({ name: 'The Lees', organiser: true })
    expect(await roomFamily(db, 'eve', LEES)).toBeNull()
    expect(await roomFamily(db, 'ann', STONES)).toBeNull()
    expect(await roomFamiliesOf(db, 'eve')).toEqual([])
  })
})

describe('adding a photo', () => {
  it("stores both files under the family's own prefix, with one row", async () => {
    const added = await add(lees(), 'ann')

    expect(await stored()).toEqual([
      `room/${LEES}/${added.id}.jpg`,
      `room/${LEES}/${added.id}.thumb.jpg`,
    ])
    expect(added).toMatchObject({ uploadedBy: 'ann', width: 800, height: 600, albumId: null })
    expect(await roomUsage(db, LEES)).toEqual({ photos: 1, bytes: JPEG.length + THUMB.length })
  })

  it('takes only JPEGs, only while the family is open, and only into its own albums', async () => {
    const by = { id: 'ann', name: 'ann' }
    const notJpeg = { ...photo, full: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }
    expect((await addRoomPhoto(db, store, lees(), by, notJpeg, NOW)).status).toBe('not-a-photo')
    const closed = { ...lees(), closed: true }
    expect((await addRoomPhoto(db, store, closed, by, photo, NOW)).status).toBe('closed')

    const theirs = await createRoomAlbum(db, stones, 'eve', 'Stones only', NOW)
    if (theirs === 'closed') throw new Error('closed')
    const crossed = await addRoomPhoto(db, store, lees(), by, { ...photo, albumId: theirs.id }, NOW)
    expect(crossed.status).toBe('no-album')
    expect(await stored()).toEqual([])
    expect(isJpeg(JPEG)).toBe(true)
    expect(isJpeg(new Uint8Array([0xff, 0xd8]))).toBe(false)
  })

  it("stops at the family's storage limit", async () => {
    await db.insert(roomPhotos).values({
      familyId: LEES,
      uploadedBy: 'bob',
      storageKey: 'room/x/big.jpg',
      thumbKey: 'room/x/big.thumb.jpg',
      sizeBytes: ROOM_FAMILY_BYTES_MAX - 5,
      width: 1,
      height: 1,
    })
    const by = { id: 'ann', name: 'ann' }
    expect((await addRoomPhoto(db, store, lees(), by, photo, NOW)).status).toBe('full')
    expect((await addRoomPhoto(db, store, stones, by, photo, NOW)).status).toBe('added')
  })
})

describe('one family never sees another', () => {
  it('lists, finds and counts only its own photos and albums', async () => {
    const ours = await add(lees(), 'ann')
    const theirs = await add(stones, 'eve')
    await createRoomAlbum(db, stones, 'eve', 'Stones only', NOW)

    expect((await listRoomPhotos(db, LEES)).photos.map((row) => row.id)).toEqual([ours.id])
    expect(await listRoomAlbums(db, LEES)).toEqual([])
    expect(await findRoomPhoto(db, LEES, theirs.id)).toBeNull()
    expect(await findRoomPhoto(db, STONES, theirs.id)).not.toBeNull()
    expect(await updateRoomPhoto(db, lees(true), 'ann', theirs.id, { caption: 'x' })).toBe(
      'not-found',
    )
    expect(await deleteRoomPhoto(db, store, lees(true), 'ann', theirs.id)).toBe('not-found')
    expect((await listRoomPhotos(db, STONES)).photos).toHaveLength(1)
  })
})

describe('changing and removing', () => {
  it('is for whoever added the photo, or the organiser', async () => {
    const added = await add(lees(), 'ann')

    expect(await updateRoomPhoto(db, lees(), 'bob', added.id, { caption: 'Mine now' })).toBe(
      'not-yours',
    )
    expect(await deleteRoomPhoto(db, store, lees(), 'bob', added.id)).toBe('not-yours')
    expect(await updateRoomPhoto(db, lees(), 'ann', added.id, { caption: ' Plums ' })).toBe('done')
    expect((await listRoomPhotos(db, LEES)).photos[0]).toMatchObject({
      caption: ' Plums ',
      uploaderName: 'ann name',
    })
    expect(await deleteRoomPhoto(db, store, lees(true), 'bob', added.id)).toBe('done')
    expect(await stored()).toEqual([])
    expect(await roomUsage(db, LEES)).toEqual({ photos: 0, bytes: 0 })
  })

  it('keeps the photos of an album that is deleted', async () => {
    const album = await createRoomAlbum(db, lees(), 'ann', 'Summer', NOW)
    if (album === 'closed') throw new Error('closed')
    const inside = await add(lees(), 'bob', NOW, album.id)
    expect(await listRoomAlbums(db, LEES)).toMatchObject([{ name: 'Summer', photoCount: 1 }])
    expect((await listRoomPhotos(db, LEES, { album: 'none' })).photos).toEqual([])

    expect(await renameRoomAlbum(db, lees(), 'bob', album.id, 'Autumn')).toBe('not-yours')
    expect(await renameRoomAlbum(db, lees(), 'ann', album.id, 'Autumn')).toBe('done')
    expect(await deleteRoomAlbum(db, stones, 'eve', album.id)).toBe('not-found')
    expect(await deleteRoomAlbum(db, lees(), 'ann', album.id)).toBe('done')
    expect(await listRoomAlbums(db, LEES)).toEqual([])
    expect((await listRoomPhotos(db, LEES, { album: 'none' })).photos.map((row) => row.id)).toEqual(
      [inside.id],
    )
    const closed = { ...lees(), closed: true }
    expect(await createRoomAlbum(db, closed, 'ann', 'Late', NOW)).toBe('closed')
  })
})

describe('paging', () => {
  it('goes newest first and picks up where the last page ended', async () => {
    const first = await add(lees(), 'ann', new Date('2026-11-01T10:00:00Z'))
    const second = await add(lees(), 'ann', new Date('2026-11-02T10:00:00Z'))
    const all = await listRoomPhotos(db, LEES)
    expect(all.photos.map((row) => row.id)).toEqual([second.id, first.id])
    expect(all.nextCursor).toBeNull()

    const cursor = encodeRoomCursor({ createdAt: new Date(second.createdAt), id: second.id })
    expect((await listRoomPhotos(db, LEES, { cursor })).photos.map((row) => row.id)).toEqual([
      first.id,
    ])
    expect(decodeRoomCursor(cursor)?.id).toBe(second.id)
    expect(decodeRoomCursor('nonsense')).toBeNull()
  })
})

describe('deleting an account', () => {
  it("takes that person's photos and files with it, and leaves their albums", async () => {
    clearExtensionsForTest()
    registerRoomExtensions(store)
    const album = await createRoomAlbum(db, lees(), 'ann', 'Summer', NOW)
    if (album === 'closed') throw new Error('closed')
    await add(lees(), 'ann', NOW, album.id)
    const kept = await add(lees(), 'bob', NOW, album.id)

    const contributor = getAccountContributors().find((entry) => entry.key === 'room')!
    expect(await contributor.countForDeletion!(db, 'ann')).toBe(1)
    expect(await contributor.exportSection!(db, 'ann')).toMatchObject([
      { familyId: LEES, albumId: album.id },
    ])
    await contributor.beforeDeletion!(db, 'ann')
    const statements = contributor.deletionStatements!(db, 'ann') as BatchItem<'sqlite'>[]
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

    expect((await listRoomPhotos(db, LEES)).photos.map((row) => row.id)).toEqual([kept.id])
    expect(await stored()).toHaveLength(2)
    expect(await listRoomAlbums(db, LEES)).toMatchObject([{ createdBy: null, photoCount: 1 }])
  })
})

describe('where everyone is', () => {
  const TOKYO = 1850147
  const CHICAGO = 4887398
  const members = [
    { id: 'ann', name: 'Ann' },
    { id: 'bob', name: 'Bob' },
  ]

  beforeEach(async () => {
    await db.delete(cities)
    await db.insert(cities).values([
      {
        id: TOKYO,
        name: 'Tokyo',
        searchName: 'tokyo',
        country: 'JP',
        lat: 35.69,
        lng: 139.69,
        timeZone: 'Asia/Tokyo',
      },
      {
        id: CHICAGO,
        name: 'Chicago',
        searchName: 'chicago',
        country: 'US',
        lat: 41.85,
        lng: -87.65,
        timeZone: 'America/Chicago',
      },
    ])
    registerRoomFamilies({
      membership: async () => null,
      list: async () => [],
      members: async (_db, familyId) => (familyId === LEES ? members : []),
    })
  })

  it('lists each person in the family with the last city they said', async () => {
    expect(await checkIn(db, lees(), 'ann', 1, NOW)).toBe('unknown-city')
    expect(await checkIn(db, lees(), 'ann', CHICAGO, NOW)).toBe('done')
    expect(await checkIn(db, lees(), 'ann', TOKYO, new Date('2026-11-18T09:00:00Z'))).toBe('done')

    expect(await whereabouts(db, LEES)).toEqual([
      { userId: 'ann', name: 'Ann', city: 'Tokyo', country: 'JP', at: '2026-11-18T09:00:00.000Z' },
      { userId: 'bob', name: 'Bob', city: null, country: null, at: null },
    ])
  })

  it('is said to one family at a time, and never by someone who has left', async () => {
    await checkIn(db, lees(), 'ann', CHICAGO, NOW)
    await checkIn(db, lees(), 'eve', TOKYO, NOW)

    expect(await whereabouts(db, STONES)).toEqual([])
    expect((await whereabouts(db, LEES)).map((person) => person.userId)).toEqual(['ann', 'bob'])
    expect(await checkIn(db, { ...lees(), closed: true }, 'ann', TOKYO, NOW)).toBe('closed')
  })

  it('can be taken back, and goes with a deleted account', async () => {
    await checkIn(db, lees(), 'ann', CHICAGO, NOW)
    await checkIn(db, stones, 'ann', CHICAGO, NOW)
    await forgetCheckins(db, LEES, 'ann')
    expect((await whereabouts(db, LEES))[0]).toMatchObject({ userId: 'ann', city: null })
    expect(await db.select().from(roomCheckins)).toHaveLength(1)

    clearExtensionsForTest()
    registerRoomExtensions(store)
    const contributor = getAccountContributors().find((entry) => entry.key === 'room')!
    const statements = contributor.deletionStatements!(db, 'ann') as BatchItem<'sqlite'>[]
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
    expect(await db.select().from(roomCheckins)).toEqual([])
  })
})
