// The reader's side of a letter's encryption: this device's private key and
// the account's public key, used to wrap a new letter's key for its author
// and to open the keys of letters they can read.

import { publicKeyOf } from '#layers/keys/app/utils/key-crypto'

import { unwrapContentKey, wrapContentKey } from '../utils/letter-crypto'

export function useLetterKeys() {
  const { user } = useUserSession()
  const keys = useKeys()
  let publicKey: string | null = null

  const me = () => {
    const id = user.value?.id
    if (!id) throw new Error('Not signed in')
    return id
  }

  // Worked out from the key this device holds, never asked of the server: a
  // letter's key wrapped to a public key the server chose would be the
  // server's to open.
  async function myPublicKey(): Promise<string> {
    if (publicKey) return publicKey
    const privateKey = await keys.privateKey()
    if (!privateKey) throw new Error('This device does not hold your key')
    publicKey = await publicKeyOf(privateKey)
    return publicKey
  }

  return {
    me,
    /** The author's own copy of a new letter's key. */
    async wrapForMe(contentKey: Uint8Array<ArrayBuffer>, letterId: string): Promise<string> {
      return wrapContentKey(await myPublicKey(), contentKey, { letterId, readerId: me() })
    },
    /** Opens this reader's copy of a letter's key. Null if this device cannot. */
    async open(wrapped: string, letterId: string): Promise<Uint8Array<ArrayBuffer> | null> {
      const privateKey = await keys.privateKey()
      if (!privateKey) return null
      return unwrapContentKey(privateKey, wrapped, { letterId, readerId: me() })
    },
  }
}
