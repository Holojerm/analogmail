// The app's object storage as a `RoomStore`, apart from the rules in
// room-photos.ts so they can be tested against a bucket directly.

import { blob } from '@nuxthub/blob'

import type { RoomStore } from './room-photos'

export const roomStore: RoomStore = {
  async put(key, bytes) {
    await blob.put(key, bytes, { contentType: 'image/jpeg' })
  },
  async remove(keys) {
    await blob.del(keys)
  },
}
