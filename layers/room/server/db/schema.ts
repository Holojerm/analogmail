import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

const createdAt = () =>
  integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull()

// Every row in the room names its family, and every read is scoped to it.
// Albums belong to the family: one outlives the member who made it, because
// other people's photos may be in it.
export const roomAlbums = sqliteTable(
  'room_albums',
  {
    id: id(),
    familyId: text('family_id').notNull(),
    name: text('name').notNull(),
    // Null once that member deletes their account.
    createdBy: text('created_by'),
    createdAt: createdAt(),
  },
  (table) => [index('room_albums_family_idx').on(table.familyId, table.createdAt)],
)

// One row for a photo and its small copy, both under `room/<family>/`. The
// browser makes both, so the server never needs to resize an image.
export const roomPhotos = sqliteTable(
  'room_photos',
  {
    id: id(),
    familyId: text('family_id').notNull(),
    // Null = in no album. Deleting an album leaves its photos here.
    albumId: text('album_id'),
    uploadedBy: text('uploaded_by').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    thumbKey: text('thumb_key').notNull(),
    // Both files together, for the family's storage limit.
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    caption: text('caption'),
    createdAt: createdAt(),
  },
  (table) => [
    index('room_photos_family_idx').on(table.familyId, table.createdAt),
    index('room_photos_album_idx').on(table.albumId, table.createdAt),
    index('room_photos_uploader_idx').on(table.uploadedBy),
  ],
)

export type RoomAlbumRow = typeof roomAlbums.$inferSelect
export type RoomPhotoRow = typeof roomPhotos.$inferSelect
