// A family's copy of its room: what goes in it and how it is laid out. The
// copy is made in the browser, from pictures the person can already open, and
// is split into parts so that no part has to be held in memory at once.

import type { RoomFamily, RoomWhereabouts } from './room-types'

/** One part of the copy holds no more than this many bytes of photos. */
export const ROOM_EXPORT_PART_BYTES = 200 * 1024 * 1024

export interface RoomExportPhoto {
  id: string
  /** The album's name, or null for a photo in no album. */
  album: string | null
  caption: string | null
  addedBy: string | null
  createdAt: string
  sizeBytes: number
}

export interface RoomExport {
  family: RoomFamily
  /** Oldest first, so an earlier part stays the same as photos are added. */
  photos: RoomExportPhoto[]
  people: RoomWhereabouts[]
}

/** Photos in order, cut into parts no larger than `max`. A photo is never split. */
export function roomExportParts(
  photos: RoomExportPhoto[],
  max = ROOM_EXPORT_PART_BYTES,
): RoomExportPhoto[][] {
  const parts: RoomExportPhoto[][] = []
  let size = 0
  for (const photo of photos) {
    const current = parts.at(-1)
    if (!current || size + photo.sizeBytes > max) {
      parts.push([photo])
      size = photo.sizeBytes
    } else {
      current.push(photo)
      size += photo.sizeBytes
    }
  }
  return parts
}

// Characters no filing system refuses, on any of the three desktops.
const safe = (text: string) =>
  text
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .slice(0, 60) || 'Untitled'

export const roomExportFolder = (familyName: string) => safe(familyName)

/** Where a photo sits inside the copy. `number` counts across every part. */
export function roomExportFile(photo: RoomExportPhoto, number: number): string {
  const album = photo.album ? safe(photo.album) : 'No album'
  const day = photo.createdAt.slice(0, 10)
  return `photos/${album}/${day} ${String(number).padStart(4, '0')}.jpg`
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ESCAPES[char]!)

const longDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

/** One page that shows every photo in a part, with what was written under it. */
export function roomExportPage(
  familyName: string,
  part: { number: number; of: number },
  entries: { file: string; photo: RoomExportPhoto }[],
): string {
  const title =
    part.of > 1
      ? `${familyName}: photos, part ${part.number} of ${part.of}`
      : `${familyName}: photos`
  const figures = entries
    .map(({ file, photo }) => {
      const lines = [
        photo.caption ? `<p>${escape(photo.caption)}</p>` : '',
        `<p class="by">${[
          photo.album,
          photo.addedBy && `added by ${photo.addedBy}`,
          longDay(photo.createdAt),
        ]
          .filter((piece): piece is string => Boolean(piece))
          .map(escape)
          .join(' · ')}</p>`,
      ].join('')
      return `<figure><img src="${escape(encodeURI(file))}" alt="${escape(photo.caption ?? '')}" loading="lazy"><figcaption>${lines}</figcaption></figure>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
body { font: 16px/1.5 Georgia, serif; color: #2a2622; background: #fbf9f5; max-width: 46rem; margin: 3rem auto; padding: 0 1rem; }
h1 { font-weight: normal; }
figure { margin: 0 0 3rem; break-inside: avoid; }
img { max-width: 100%; height: auto; display: block; }
figcaption p { margin: 0.5rem 0 0; }
.by { color: #6f675e; font-size: 0.875rem; }
</style>
</head>
<body>
<h1>${escape(title)}</h1>
${figures}
</body>
</html>
`
}

/** Where each person says they are, as plain text. */
export function roomExportWhere(people: RoomWhereabouts[]): string {
  const lines = people.map((person) =>
    person.city && person.at
      ? `${person.name}: ${person.city}, ${person.country}, since ${longDay(person.at)}`
      : `${person.name}: has not said`,
  )
  return `Where everyone says they are\n\n${lines.join('\n')}\n`
}

export function roomExportReadme(
  familyName: string,
  part: { number: number; of: number },
  madeOn: string,
  missing: number,
  appName: string,
): string {
  const lines = [
    `The room of ${familyName}, from ${appName}.`,
    `Made on ${madeOn}.`,
    part.of > 1 ? `This is part ${part.number} of ${part.of}. Each part stands on its own.` : '',
    '',
    'photos.html shows every photo here with its caption. Open it in any browser.',
    'The photos folder holds the pictures as the room stores them, one folder per album.',
    part.number === 1 ? 'where-everyone-is.txt lists the city each person last said.' : '',
    missing
      ? `${missing} ${missing === 1 ? 'photo was' : 'photos were'} deleted while this copy was being made and ${missing === 1 ? 'is' : 'are'} not in it.`
      : '',
  ]
  return `${lines.filter((line, index) => line || index === 3).join('\n')}\n`
}
