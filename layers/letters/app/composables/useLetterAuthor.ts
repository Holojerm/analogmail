// Who a letter on the desk is written by, on this device: the person signed
// in, or a child's mantel they keep. As a mantel, the author's copy of the
// letter's key is wrapped to the mantel's key, opened here from this keeper's
// copy and held in memory only. Its public key is worked out from that
// private key, never taken from the server: a key the server chose would be
// the server's to open.

import type { KeptMantel } from '#layers/keys/app/composables/useMantelKeys'
import { importPrivateKey, publicKeyOf } from '#layers/keys/app/utils/key-crypto'

import type { KeptLetter } from '../../shared/utils/kept'
import { parseLetterDoc, type LetterDoc } from '../../shared/utils/letter-doc'
import { decryptLetter, unwrapContentKey, wrapContentKey } from '../utils/letter-crypto'

type Bytes = Uint8Array<ArrayBuffer>

export interface LetterAuthor {
  /** Set when writing as a child's mantel. */
  mantelId: string | null
  /** The mantel's name, which a letter from it is signed with. */
  mantelName: string | null
  /** As a mantel: the public key the author's copy is wrapped to, for the server's check. */
  authorKey: string | undefined
  /** The author's own copy of a letter's key. */
  wrap(contentKey: Bytes, letterId: string): Promise<string>
  /** Opens the author's copy. Null if this device cannot. */
  open(wrapped: string, letterId: string): Promise<Bytes | null>
  /** A letter that arrived for the author, to lie above a reply. Null if it cannot be read. */
  readReceived(letterId: string): Promise<{ doc: LetterDoc; photoUrl: string | null } | null>
}

export function useLetterAuthor() {
  const letterKeys = useLetterKeys()
  const mantelKeys = useMantelKeys()
  const openLetter = useOpenLetter()

  /** Throws when this device cannot write as that mantel. */
  return async function authorFor(mantelId: string | null): Promise<LetterAuthor> {
    if (!mantelId) {
      return {
        mantelId: null,
        mantelName: null,
        authorKey: undefined,
        wrap: letterKeys.wrapForMe,
        open: letterKeys.open,
        readReceived: (id) => openLetter(id),
      }
    }
    const mantel = await $fetch<KeptMantel & { name: string; publicKey: string }>(
      '/api/mantels/view',
      { method: 'POST', body: { id: mantelId } },
    )
    const mantelKey = await mantelKeys.open(mantel)
    if (!mantelKey) throw new Error('This device cannot open the mantel')
    const privateKey = await importPrivateKey(mantelKey)
    const publicKey = await publicKeyOf(privateKey)
    // The server's word for the key must be the pair of the one opened here.
    if (publicKey !== mantel.publicKey) throw new Error('The mantel key does not match')
    const context = (letterId: string) => ({ letterId, readerId: mantelId })

    return {
      mantelId,
      mantelName: mantel.name,
      authorKey: publicKey,
      wrap: (contentKey, letterId) => wrapContentKey(publicKey, contentKey, context(letterId)),
      open: (wrapped, letterId) => unwrapContentKey(privateKey, wrapped, context(letterId)),
      async readReceived(letterId) {
        const letter = await $fetch<KeptLetter>('/api/letters/kept/open', {
          method: 'POST',
          body: { mantelId, letterId },
        })
        if (letter.sealed) return null
        const key = await unwrapContentKey(privateKey, letter.wrappedKey, context(letterId))
        const text = key ? await decryptLetter(key, letterId, letter.ciphertext) : null
        const doc = text ? parseLetterDoc(text) : null
        if (!key || !doc) return null
        const photoUrl = doc.photo
          ? await loadLetterPhoto(key, letterId, doc.photo, mantelId)
          : null
        return { doc, photoUrl }
      },
    }
  }
}
