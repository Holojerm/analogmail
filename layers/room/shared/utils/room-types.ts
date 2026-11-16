// What the family room's API returns, and its limits. Shared by the server
// and the pages.

export interface RoomFamily {
  id: string
  name: string
  /** A closed family's room can be looked at and emptied, not added to. */
  closed: boolean
  /** The organiser may remove any photo or album, as its owner may. */
  organiser: boolean
}

export interface RoomPhoto {
  id: string
  albumId: string | null
  caption: string | null
  uploadedBy: string
  uploaderName: string | null
  width: number
  height: number
  createdAt: string
}

export interface RoomAlbum {
  id: string
  name: string
  createdBy: string | null
  photoCount: number
  createdAt: string
}

export interface RoomUsage {
  photos: number
  bytes: number
}

/** Where one person in the family last said they were. */
export interface RoomWhereabouts {
  userId: string
  name: string
  /** Null until they have said. */
  city: string | null
  country: string | null
  at: string | null
}

/** The family's map, already drawn: SVG path strings and a dot per city. */
export interface RoomMap {
  width: number
  height: number
  /** True when the family fits only on the whole globe. */
  world: boolean
  /** The globe's edge in world view; null when zoomed in (the frame is the edge). */
  outline: string | null
  land: string
  borders: string
  graticule: string
  points: { id: string; x: number; y: number; people: number }[]
}
export const ROOM_MAP_SIZE = { width: 760, height: 400 }

/** Long edge of a stored photo, and of its small copy for the grid. */
export const ROOM_PHOTO_EDGE = 2560
export const ROOM_THUMB_EDGE = 640
export const ROOM_PHOTO_BYTES_MAX = 8 * 1024 * 1024
export const ROOM_THUMB_BYTES_MAX = 512 * 1024
/** What one family's room may hold in all. */
export const ROOM_FAMILY_BYTES_MAX = 5 * 1024 ** 3
export const ROOM_CAPTION_MAX = 500
export const ROOM_ALBUM_NAME_MAX = 100
export const ROOM_PAGE_SIZE = 48

export const roomPhotoSrc = (familyId: string, photoId: string, size: 'thumb' | 'full') =>
  `/api/room/${familyId}/photos/${photoId}/image?size=${size}`
