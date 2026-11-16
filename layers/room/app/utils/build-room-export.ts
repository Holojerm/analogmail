// Builds one part of a family's copy of its room, on this device: fetches
// each picture through the album's own route and stores them in a zip beside
// a page that shows them.

import { zipBlob, type ZipFile } from '#layers/post/app/utils/zip'

import {
  roomExportFile,
  roomExportFolder,
  roomExportPage,
  roomExportReadme,
  roomExportWhere,
  type RoomExport,
  type RoomExportPhoto,
} from '../../shared/utils/room-export'
import { roomPhotoSrc } from '../../shared/utils/room-types'

const text = (value: string) => new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>

export interface BuiltRoomExport {
  blob: Blob
  name: string
  /** Photos deleted between listing the room and fetching them. */
  missing: number
}

/**
 * `index` picks the part. `firstNumber` is the count of photos in the parts
 * before it, so a photo keeps one number across the whole copy.
 */
export async function buildRoomExportPart(
  room: RoomExport,
  parts: RoomExportPhoto[][],
  index: number,
  today: Date,
  onProgress: (done: number, of: number) => void,
): Promise<BuiltRoomExport> {
  const photos = parts[index] ?? []
  const firstNumber = parts.slice(0, index).reduce((count, part) => count + part.length, 0)
  const part = { number: index + 1, of: parts.length }
  const folder = roomExportFolder(room.family.name)

  const files: ZipFile[] = []
  const shown: { file: string; photo: RoomExportPhoto }[] = []
  let missing = 0
  for (const [offset, photo] of photos.entries()) {
    onProgress(offset, photos.length)
    const response = await fetch(roomPhotoSrc(room.family.id, photo.id, 'full'))
    if (response.status === 404) {
      missing += 1
      continue
    }
    if (!response.ok) throw new Error(`A photo could not be fetched (${response.status}).`)
    const file = roomExportFile(photo, firstNumber + offset + 1)
    files.push({
      name: `${folder}/${file}`,
      data: new Uint8Array(await response.arrayBuffer()),
    })
    shown.push({ file, photo })
  }
  onProgress(photos.length, photos.length)

  const day = today.toISOString().slice(0, 10)
  files.unshift(
    {
      name: `${folder}/README.txt`,
      data: text(roomExportReadme(room.family.name, part, day, missing)),
    },
    {
      name: `${folder}/photos.html`,
      data: text(roomExportPage(room.family.name, part, shown)),
    },
    ...(index === 0
      ? [{ name: `${folder}/where-everyone-is.txt`, data: text(roomExportWhere(room.people)) }]
      : []),
  )
  const suffix = parts.length > 1 ? ` part ${part.number} of ${part.of}` : ''
  return {
    blob: zipBlob(files, today),
    name: `Dear Mantel room ${folder}${suffix} ${day}.zip`,
    missing,
  }
}
