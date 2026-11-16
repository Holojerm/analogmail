// The app's object storage as a `PhotoStore`. Kept apart from the rules in
// photos.ts so they can be tested against a bucket directly.

import { blob } from '@nuxthub/blob'

import type { PhotoStore } from './photos'

export const photoStore: PhotoStore = {
  async put(key, bytes) {
    await blob.put(key, bytes, { contentType: 'application/octet-stream' })
  },
  async get(key) {
    const found = await blob.get(key)
    return found ? found.arrayBuffer() : null
  },
  async remove(keys) {
    await blob.del(keys)
  },
}
