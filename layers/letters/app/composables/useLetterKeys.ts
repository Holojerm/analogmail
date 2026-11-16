// The reader's side of a letter's encryption: this device's private key and
// the account's public key, used to wrap a new letter's key for its author
// and to open the keys of letters they can read.

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

  async function myPublicKey(): Promise<string> {
    if (publicKey) return publicKey
    const stored = await $fetch<{ keys: { publicKey: string } | null }>('/api/keys')
    if (!stored.keys) throw new Error('This account has no keys')
    publicKey = stored.keys.publicKey
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
