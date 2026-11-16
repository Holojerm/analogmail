// The family album. Every function takes the family the caller was found to
// be in (room-families.ts) and touches only that family's rows and files.
// A photo is changed or removed by whoever added it, or by the organiser.

import { and, count, desc, eq, isNull, lt, or, sum } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import {
  ROOM_FAMILY_BYTES_MAX,
  ROOM_PAGE_SIZE,
  type RoomAlbum,
  type RoomFamily,
  type RoomPhoto,
  type RoomUsage,
} from '../../shared/utils/room-types'
import type { RoomPhotoRow } from '../db/schema'
import type { RoomDb } from './room-families'

/** Object storage, as much of it as the room needs. */
export interface RoomStore {
  put(key: string, bytes: Uint8Array): Promise<void>
  remove(keys: string[]): Promise<void>
}

export const roomPhotoKeys = (familyId: string, photoId: string) => ({
  full: `room/${familyId}/${photoId}.jpg`,
  thumb: `room/${familyId}/${photoId}.thumb.jpg`,
})

/** The browser re-encodes every photo as a JPEG; anything else was not made by it. */
export const isJpeg = (bytes: Uint8Array) =>
  bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

const view = (row: RoomPhotoRow, uploaderName: string | null): RoomPhoto => ({
  id: row.id,
  albumId: row.albumId,
  caption: row.caption,
  uploadedBy: row.uploadedBy,
  uploaderName,
  width: row.width,
  height: row.height,
  createdAt: row.createdAt.toISOString(),
})

/** `<epoch seconds>.<id>`: newest first, stable across uploads in the same second. */
export const encodeRoomCursor = (row: { createdAt: Date; id: string }) =>
  `${Math.floor(row.createdAt.getTime() / 1000)}.${row.id}`

export function decodeRoomCursor(raw: string): { createdAt: Date; id: string } | null {
  const match = /^(\d{1,12})\.([0-9a-f-]{36})$/.exec(raw)
  if (!match?.[1] || !match[2]) return null
  return { createdAt: new Date(Number(match[1]) * 1000), id: match[2] }
}

/** `album`: an album id, `'none'` for photos in no album, or omitted for all. */
export async function listRoomPhotos(
  db: RoomDb,
  familyId: string,
  options: { album?: string; cursor?: string } = {},
): Promise<{ photos: RoomPhoto[]; nextCursor: string | null }> {
  const { roomPhotos, users } = tables
  const filters = [eq(roomPhotos.familyId, familyId)]
  if (options.album === 'none') filters.push(isNull(roomPhotos.albumId))
  else if (options.album) filters.push(eq(roomPhotos.albumId, options.album))
  const cursor = options.cursor ? decodeRoomCursor(options.cursor) : null
  if (cursor) {
    filters.push(
      or(
        lt(roomPhotos.createdAt, cursor.createdAt),
        and(eq(roomPhotos.createdAt, cursor.createdAt), lt(roomPhotos.id, cursor.id)),
      )!,
    )
  }
  const rows = await db
    .select({ photo: roomPhotos, uploaderName: users.name })
    .from(roomPhotos)
    .leftJoin(users, eq(users.id, roomPhotos.uploadedBy))
    .where(and(...filters))
    .orderBy(desc(roomPhotos.createdAt), desc(roomPhotos.id))
    .limit(ROOM_PAGE_SIZE + 1)
  const page = rows.slice(0, ROOM_PAGE_SIZE)
  const last = page.at(-1)
  return {
    photos: page.map((row) => view(row.photo, row.uploaderName)),
    nextCursor: rows.length > ROOM_PAGE_SIZE && last ? encodeRoomCursor(last.photo) : null,
  }
}

export async function listRoomAlbums(db: RoomDb, familyId: string): Promise<RoomAlbum[]> {
  const { roomAlbums, roomPhotos } = tables
  const rows = await db
    .select({ album: roomAlbums, photoCount: count(roomPhotos.id) })
    .from(roomAlbums)
    .leftJoin(roomPhotos, eq(roomPhotos.albumId, roomAlbums.id))
    .where(eq(roomAlbums.familyId, familyId))
    .groupBy(roomAlbums.id)
    .orderBy(desc(roomAlbums.createdAt))
  return rows.map(({ album, photoCount }) => ({
    id: album.id,
    name: album.name,
    createdBy: album.createdBy,
    photoCount,
    createdAt: album.createdAt.toISOString(),
  }))
}

export async function roomUsage(db: RoomDb, familyId: string): Promise<RoomUsage> {
  const { roomPhotos } = tables
  const [row] = await db
    .select({ photos: count(), bytes: sum(roomPhotos.sizeBytes) })
    .from(roomPhotos)
    .where(eq(roomPhotos.familyId, familyId))
  return { photos: row?.photos ?? 0, bytes: Number(row?.bytes ?? 0) }
}

async function albumIn(db: RoomDb, familyId: string, albumId: string) {
  const { roomAlbums } = tables
  const [album] = await db
    .select()
    .from(roomAlbums)
    .where(and(eq(roomAlbums.id, albumId), eq(roomAlbums.familyId, familyId)))
    .limit(1)
  return album ?? null
}

export async function findRoomPhoto(db: RoomDb, familyId: string, photoId: string) {
  const { roomPhotos } = tables
  const [photo] = await db
    .select()
    .from(roomPhotos)
    .where(and(eq(roomPhotos.id, photoId), eq(roomPhotos.familyId, familyId)))
    .limit(1)
  return photo ?? null
}

export type AddRoomPhotoResult =
  | { status: 'added'; photo: RoomPhoto }
  | { status: 'closed' | 'full' | 'no-album' | 'not-a-photo' }

/** Stores a photo and its small copy for the family. Files first, then the row. */
export async function addRoomPhoto(
  db: RoomDb,
  store: RoomStore,
  family: RoomFamily,
  uploader: { id: string; name: string | null },
  input: { full: Uint8Array; thumb: Uint8Array; width: number; height: number; albumId?: string },
  now: Date,
): Promise<AddRoomPhotoResult> {
  const { roomPhotos } = tables
  if (family.closed) return { status: 'closed' }
  if (!isJpeg(input.full) || !isJpeg(input.thumb)) return { status: 'not-a-photo' }
  if (input.albumId && !(await albumIn(db, family.id, input.albumId))) {
    return { status: 'no-album' }
  }
  const sizeBytes = input.full.length + input.thumb.length
  if ((await roomUsage(db, family.id)).bytes + sizeBytes > ROOM_FAMILY_BYTES_MAX) {
    return { status: 'full' }
  }

  const id = crypto.randomUUID()
  const keys = roomPhotoKeys(family.id, id)
  // A row always has files behind it. If the row fails, the files go again.
  await store.put(keys.full, input.full)
  await store.put(keys.thumb, input.thumb)
  try {
    const [row] = await db
      .insert(roomPhotos)
      .values({
        id,
        familyId: family.id,
        albumId: input.albumId ?? null,
        uploadedBy: uploader.id,
        storageKey: keys.full,
        thumbKey: keys.thumb,
        sizeBytes,
        width: input.width,
        height: input.height,
        createdAt: now,
      })
      .returning()
    if (!row) throw new Error('The photo row was not written')
    return { status: 'added', photo: view(row, uploader.name) }
  } catch (error) {
    await store.remove([keys.full, keys.thumb])
    throw error
  }
}

const mayManage = (family: RoomFamily, userId: string, ownerId: string | null) =>
  family.organiser || ownerId === userId

export type RoomChange = 'done' | 'not-found' | 'not-yours' | 'no-album'

export async function updateRoomPhoto(
  db: RoomDb,
  family: RoomFamily,
  userId: string,
  photoId: string,
  change: { caption?: string | null; albumId?: string | null },
): Promise<RoomChange> {
  const { roomPhotos } = tables
  const photo = await findRoomPhoto(db, family.id, photoId)
  if (!photo) return 'not-found'
  if (!mayManage(family, userId, photo.uploadedBy)) return 'not-yours'
  if (change.albumId && !(await albumIn(db, family.id, change.albumId))) return 'no-album'
  await db
    .update(roomPhotos)
    .set({
      ...(change.caption !== undefined && { caption: change.caption || null }),
      ...(change.albumId !== undefined && { albumId: change.albumId }),
    })
    .where(and(eq(roomPhotos.id, photoId), eq(roomPhotos.familyId, family.id)))
  return 'done'
}

/** Row first: once it is gone nothing points at the files. */
export async function deleteRoomPhoto(
  db: RoomDb,
  store: RoomStore,
  family: RoomFamily,
  userId: string,
  photoId: string,
): Promise<RoomChange> {
  const { roomPhotos } = tables
  const photo = await findRoomPhoto(db, family.id, photoId)
  if (!photo) return 'not-found'
  if (!mayManage(family, userId, photo.uploadedBy)) return 'not-yours'
  await db
    .delete(roomPhotos)
    .where(and(eq(roomPhotos.id, photoId), eq(roomPhotos.familyId, family.id)))
  await store.remove([photo.storageKey, photo.thumbKey])
  return 'done'
}

export async function createRoomAlbum(
  db: RoomDb,
  family: RoomFamily,
  userId: string,
  name: string,
  now: Date,
): Promise<{ id: string; name: string } | 'closed'> {
  const { roomAlbums } = tables
  if (family.closed) return 'closed'
  const id = crypto.randomUUID()
  await db
    .insert(roomAlbums)
    .values({ id, familyId: family.id, name, createdBy: userId, createdAt: now })
  return { id, name }
}

export async function renameRoomAlbum(
  db: RoomDb,
  family: RoomFamily,
  userId: string,
  albumId: string,
  name: string,
): Promise<RoomChange> {
  const { roomAlbums } = tables
  const album = await albumIn(db, family.id, albumId)
  if (!album) return 'not-found'
  if (!mayManage(family, userId, album.createdBy)) return 'not-yours'
  await db.update(roomAlbums).set({ name }).where(eq(roomAlbums.id, albumId))
  return 'done'
}

/** The album goes; its photos stay in the room, in no album. */
export async function deleteRoomAlbum(
  db: RoomDb,
  family: RoomFamily,
  userId: string,
  albumId: string,
): Promise<RoomChange> {
  const { roomAlbums, roomPhotos } = tables
  const album = await albumIn(db, family.id, albumId)
  if (!album) return 'not-found'
  if (!mayManage(family, userId, album.createdBy)) return 'not-yours'
  await db.batch([
    db.update(roomPhotos).set({ albumId: null }).where(eq(roomPhotos.albumId, albumId)),
    db.delete(roomAlbums).where(eq(roomAlbums.id, albumId)),
  ])
  return 'done'
}
