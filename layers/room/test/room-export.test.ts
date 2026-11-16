// A member's copy of a room: what is listed for it, how it is cut into parts
// and how the files inside are named and written.

import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { roomExportPhotos } from '../server/utils/room-export'
import {
  roomExportFile,
  roomExportPage,
  roomExportParts,
  roomExportReadme,
  roomExportWhere,
  type RoomExportPhoto,
} from '../shared/utils/room-export'

const db = drizzle(env.DB, { schema })
const { users, roomAlbums, roomPhotos } = schema

const LEES = 'aaaaaaaa-0000-4000-8000-000000000001'
const STONES = 'bbbbbbbb-0000-4000-8000-000000000002'

const photo = (id: string, sizeBytes: number, more: Partial<RoomExportPhoto> = {}) => ({
  id,
  album: null,
  caption: null,
  addedBy: 'Ann',
  createdAt: '2026-11-16T20:00:00.000Z',
  sizeBytes,
  ...more,
})

describe('listing a room for a copy', () => {
  beforeEach(async () => {
    await db.delete(roomPhotos)
    await db.delete(roomAlbums)
    await db.delete(users)
    await db.insert(users).values({ id: 'ann', email: 'ann@example.com', name: 'Ann' })
    await db.insert(roomAlbums).values({ id: 'summer', familyId: LEES, name: 'Summer' })
    const row = (id: string, familyId: string, day: number, albumId: string | null) => ({
      id,
      familyId,
      albumId,
      uploadedBy: id === 'gone' ? 'left' : 'ann',
      storageKey: `room/${familyId}/${id}.jpg`,
      thumbKey: `room/${familyId}/${id}.thumb.jpg`,
      sizeBytes: 1000,
      width: 800,
      height: 600,
      caption: id === 'new' ? 'The plum tree' : null,
      createdAt: new Date(Date.UTC(2026, 10, day)),
    })
    await db
      .insert(roomPhotos)
      .values([
        row('new', LEES, 16, 'summer'),
        row('old', LEES, 2, null),
        row('gone', LEES, 9, null),
        row('theirs', STONES, 1, null),
      ])
  })

  it('gives every photo of that family and no other, oldest first', async () => {
    expect(await roomExportPhotos(db, LEES)).toEqual([
      photo('old', 1000, { createdAt: '2026-11-02T00:00:00.000Z' }),
      photo('gone', 1000, { createdAt: '2026-11-09T00:00:00.000Z', addedBy: null }),
      photo('new', 1000, {
        createdAt: '2026-11-16T00:00:00.000Z',
        album: 'Summer',
        caption: 'The plum tree',
      }),
    ])
  })
})

describe('cutting a copy into parts', () => {
  it('fills each part up to the limit and never splits or drops a photo', () => {
    const photos = [photo('a', 60), photo('b', 50), photo('c', 40), photo('d', 500), photo('e', 1)]
    expect(roomExportParts(photos, 100).map((part) => part.map((p) => p.id))).toEqual([
      ['a'],
      ['b', 'c'],
      ['d'],
      ['e'],
    ])
    expect(roomExportParts([])).toEqual([])
  })
})

describe('the files in a copy', () => {
  it('names a photo by its album, day and number, with nothing a disk refuses', () => {
    expect(roomExportFile(photo('a', 1), 7)).toBe('photos/No album/2026-11-16 0007.jpg')
    expect(roomExportFile(photo('a', 1, { album: 'Sun/Sea: "2026"?' }), 12)).toBe(
      'photos/Sun Sea 2026/2026-11-16 0012.jpg',
    )
  })

  it('writes what people typed as text, never as markup', () => {
    const page = roomExportPage('Lee & <Sons>', { number: 1, of: 2 }, [
      {
        file: 'photos/No album/2026-11-16 0001.jpg',
        photo: photo('a', 1, { caption: '<script>alert(1)</script>', addedBy: 'Ann "A"' }),
      },
    ])
    expect(page).toContain('<title>Lee &amp; &lt;Sons&gt;: photos, part 1 of 2</title>')
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(page).not.toContain('<script>')
    expect(page).toContain('src="photos/No%20album/2026-11-16%200001.jpg"')
    expect(page).toContain('added by Ann &quot;A&quot; · 16 November 2026')
  })

  it('lists where everyone says they are, and says what was left out', () => {
    expect(
      roomExportWhere([
        { userId: 'a', name: 'Ann', city: 'Tokyo', country: 'JP', at: '2026-11-18T09:00:00.000Z' },
        { userId: 'b', name: 'Bob', city: null, country: null, at: null },
      ]),
    ).toBe(
      'Where everyone says they are\n\nAnn: Tokyo, JP, since 18 November 2026\nBob: has not said\n',
    )
    const readme = roomExportReadme('The Lees', { number: 2, of: 3 }, '2026-11-16', 1)
    expect(readme).toContain('This is part 2 of 3.')
    expect(readme).toContain('1 photo was deleted while this copy was being made')
    expect(readme).not.toContain('where-everyone-is.txt')
  })
})
