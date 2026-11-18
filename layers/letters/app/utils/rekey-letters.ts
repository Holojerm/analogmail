// Wrapping a mantel's letter keys again when its own key changes. Each
// letter's content key is opened with the mantel's key from before and
// wrapped to the new one. The letters themselves are not touched, or needed.

import { unwrapContentKey, wrapContentKey } from './letter-crypto'

export interface HeldLetterKey {
  letterId: string
  wrappedKey: string
}

/**
 * `previousKey` must be the mantel's current private key: the caller checks
 * that against the mantel's public key first. A copy that does not open with
 * it was never readable (a writer can send anything in its place), so it is
 * carried over as it is rather than stopping the re-key.
 */
export async function rewrapLetterKeys(
  previousKey: CryptoKey,
  nextPublicKey: string,
  mantelId: string,
  held: HeldLetterKey[],
): Promise<HeldLetterKey[]> {
  const rewrapped: HeldLetterKey[] = []
  for (const { letterId, wrappedKey } of held) {
    const context = { letterId, readerId: mantelId }
    const contentKey = await unwrapContentKey(previousKey, wrappedKey, context)
    rewrapped.push({
      letterId,
      wrappedKey: contentKey
        ? await wrapContentKey(nextPublicKey, contentKey, context)
        : wrappedKey,
    })
  }
  return rewrapped
}
