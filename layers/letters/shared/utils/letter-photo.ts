// A letter's one photo. It is resized and encrypted in the browser under the
// letter's own key. The server stores a file it cannot open and knows only
// that the letter has a photo and how large the sealed file is.

import { z } from 'zod'

/** Long edge in pixels: about 8.5 inches at 300 dots per inch. */
export const PHOTO_LONG_EDGE = 2560
/** The sealed file. A 2560 px JPEG is well under this. */
export const PHOTO_BYTES_MAX = 6 * 1024 * 1024
/** A version byte, a 12-byte IV and at least the 16-byte tag. */
export const PHOTO_BYTES_MIN = 1 + 12 + 16
export const PHOTO_ALT_MAX = 300

export const photoIdSchema = z.string().uuid()

/**
 * Kept inside the encrypted letter: which sealed file is this letter's photo.
 * A file stored under any other id does not open as this letter's photo.
 */
export const letterPhotoSchema = z.object({
  id: photoIdSchema,
  width: z.number().int().min(1).max(PHOTO_LONG_EDGE),
  height: z.number().int().min(1).max(PHOTO_LONG_EDGE),
  /** The writer's description, for a reader who cannot see the photo. */
  alt: z.string().max(PHOTO_ALT_MAX),
})
export type LetterPhoto = z.infer<typeof letterPhotoSchema>

export const photoStorageKey = (letterId: string, photoId: string) =>
  `letters/${letterId}/${photoId}`
