// Opening a letter from the mantel: fetch it, open this reader's copy of its
// key with the device's private key, and decrypt it and its photo here.

import type { OpenedLetter } from '../../shared/utils/mantel'
import { parseLetterDoc, type LetterDoc } from '../../shared/utils/letter-doc'
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
    const doc = parseLetterDoc(text)
    if (!doc) return null
    const { ciphertext: _ciphertext, wrappedKey: _wrappedKey, ...meta } = opened
    const photo = doc.photo
    return {
      ...meta,
      doc,
      photoUrl: photo ? await loadLetterPhoto(key, opened.letterId, photo) : null,
    }
  }
}
