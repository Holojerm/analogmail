// Makes a photo ready for the family room, in the browser: one copy at most
// 2560 px on its long edge and a small one for the grid. A phone's original
// is ten times what any screen shows, and redrawing it drops everything the
// camera wrote into the file, the place it was taken included.

import { ROOM_PHOTO_EDGE, ROOM_THUMB_EDGE } from '../../shared/utils/room-types'

export interface PreparedRoomPhoto {
  full: Blob
  thumb: Blob
  width: number
  height: number
}

async function draw(bitmap: ImageBitmap, edge: number, quality: number) {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  // JPEG has no transparency: without this a cut-out picture turns black.
  // This is the picture's own background, not a colour of the interface.
  context.fillStyle = 'white'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) throw new Error('Could not encode the photo')
  return { blob, width, height }
}

export async function prepareRoomPhoto(file: Blob): Promise<PreparedRoomPhoto> {
  // `from-image` applies the camera's rotation before it is discarded.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const full = await draw(bitmap, ROOM_PHOTO_EDGE, 0.85)
    const thumb = await draw(bitmap, ROOM_THUMB_EDGE, 0.8)
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height }
  } finally {
    bitmap.close()
  }
}
