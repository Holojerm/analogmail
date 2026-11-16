// Opening a letter from the mantel: fetch it, open this reader's copy of its
// key with the device's private key, and decrypt it and its photo here.

import type { OpenedLetter } from '../../shared/utils/mantel'
import { letterDocSchema, type LetterDoc } from '../../shared/utils/letter-doc'
import { decryptLetter } from '../utils/letter-crypto'

export interface ReadLetter extends Omit<OpenedLetter, 'ciphertext' | 'wrappedKey'> {
  doc: LetterDoc
  /** Null when the letter has no photo, or it could not be opened here. */
  photoUrl: string | null
}

export function useOpenLetter() {
  const letterKeys = useLetterKeys()

  /** Null when this device cannot open it. Throws when it is not on the mantel. */
  return async function openLetter(id: string): Promise<ReadLetter | null> {
    const opened = await $fetch<OpenedLetter>('/api/letters/open', {
      method: 'POST',
      body: { id },
    })
    const key = await letterKeys.open(opened.wrappedKey, opened.letterId)
    const text = key ? await decryptLetter(key, opened.letterId, opened.ciphertext) : null
    if (!key || !text) return null
    const parsed = letterDocSchema.safeParse(JSON.parse(text))
    if (!parsed.success) return null
    const { ciphertext: _ciphertext, wrappedKey: _wrappedKey, ...meta } = opened
    const photo = parsed.data.photo
    return {
      ...meta,
      doc: parsed.data,
      photoUrl: photo ? await loadLetterPhoto(key, opened.letterId, photo) : null,
    }
  }
}
