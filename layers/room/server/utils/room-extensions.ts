// What the room adds to an account: a member's photos leave with them when
// they delete their account, files included, and are listed in their data
// export. Albums they made stay, since other people's photos may be in them.

import { count, desc, eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { registerAccountContributor } from '#server/utils/extensions'

import type { RoomStore } from './room-photos'
import { roomStore } from './room-store'

/** One photo in the data export: the row, not the picture. */
export interface AccountExportRoomPhoto {
  id: string
  familyId: string
  albumId: string | null
  caption: string | null
  sizeBytes: number
  createdAt: string
}

declare module '#server/utils/extensions' {
  interface AccountExportSections {
    room: AccountExportRoomPhoto[]
  }
}

export function registerRoomExtensions(store: Pick<RoomStore, 'remove'> = roomStore): void {
  const { roomPhotos, roomAlbums } = tables
  const mine = (userId: string) => eq(roomPhotos.uploadedBy, userId)

  registerAccountContributor({
    key: 'room',
    async countForDeletion(db, userId) {
      const [row] = await db.select({ total: count() }).from(roomPhotos).where(mine(userId))
      return row?.total ?? 0
    },
    async beforeDeletion(db, userId) {
      const rows = await db
        .select({ storageKey: roomPhotos.storageKey, thumbKey: roomPhotos.thumbKey })
        .from(roomPhotos)
        .where(mine(userId))
      if (rows.length === 0) return
      try {
        await store.remove(rows.flatMap((row) => [row.storageKey, row.thumbKey]))
      } catch (error) {
        console.error(
          JSON.stringify({ kind: 'room_delete_files_failed', userId, error: String(error) }),
        )
      }
    },
    deletionStatements: (db, userId) => [
      db.delete(roomPhotos).where(mine(userId)),
      db.update(roomAlbums).set({ createdBy: null }).where(eq(roomAlbums.createdBy, userId)),
    ],
    async exportSection(db, userId) {
      const rows = await db
        .select()
        .from(roomPhotos)
        .where(mine(userId))
        .orderBy(desc(roomPhotos.createdAt), desc(roomPhotos.id))
      return rows.map((row) => ({
        id: row.id,
        familyId: row.familyId,
        albumId: row.albumId,
        caption: row.caption,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt.toISOString(),
      }))
    },
  })
}
