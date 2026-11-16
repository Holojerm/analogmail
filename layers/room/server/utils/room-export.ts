// Everything a member needs to make their own copy of a room: every photo's
// details, oldest first. The pictures themselves are fetched one by one
// through the same checked route the album uses.

import { asc, eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import type { RoomExportPhoto } from '../../shared/utils/room-export'
import type { RoomDb } from './room-families'

export async function roomExportPhotos(db: RoomDb, familyId: string): Promise<RoomExportPhoto[]> {
  const { roomAlbums, roomPhotos, users } = tables
  const rows = await db
    .select({
      id: roomPhotos.id,
      album: roomAlbums.name,
      caption: roomPhotos.caption,
      addedBy: users.name,
      createdAt: roomPhotos.createdAt,
      sizeBytes: roomPhotos.sizeBytes,
    })
    .from(roomPhotos)
    .leftJoin(roomAlbums, eq(roomAlbums.id, roomPhotos.albumId))
    .leftJoin(users, eq(users.id, roomPhotos.uploadedBy))
    .where(eq(roomPhotos.familyId, familyId))
    .orderBy(asc(roomPhotos.createdAt), asc(roomPhotos.id))
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}
