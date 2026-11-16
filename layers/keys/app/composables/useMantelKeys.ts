// A keeper's side of a custodial mantel's key: making the pair, wrapping it,
// and opening this keeper's own copy. The mantel's private key is only ever
// in memory here; it is not written to the device.

import { formatRecoveryCode, RECOVERY_CODE_BYTES } from '../../shared/utils/key-format'
import type { MantelKind } from '../../shared/utils/mantel-format'
import {
  generateMantelKeys,
  keyFingerprint,
  unwrapMantelKey,
  wrapMantelKeyForKeeper,
  wrapMantelKeyUnderCode,
} from '../utils/mantel-crypto'

export interface KeptMantel {
  id: string
  wrappedKey: string | null
}

export function useMantelKeys() {
  const { user } = useUserSession()
  const keys = useKeys()

  const me = () => {
    const id = user.value?.id
    if (!id) throw new Error('Not signed in')
    return id
  }

  async function myPublicKey(): Promise<string> {
    const stored = await $fetch<{ keys: { publicKey: string } | null }>('/api/keys')
    if (!stored.keys) throw new Error('This account has no keys')
    return stored.keys.publicKey
  }

  /** This keeper's copy of the mantel's private key, opened. Null if this device cannot. */
  async function open(mantel: KeptMantel): Promise<Uint8Array<ArrayBuffer> | null> {
    const privateKey = await keys.privateKey()
    if (!privateKey || !mantel.wrappedKey) return null
    return unwrapMantelKey(privateKey, mantel.wrappedKey, { mantelId: mantel.id, keeperId: me() })
  }

  return {
    open,
    /** What the person being seated reads out to the keeper seating them. */
    myFingerprint: async () => keyFingerprint(await myPublicKey()),

    /** Makes a mantel's keys here and opens it. Returns its recovery code, shown once. */
    async create(input: { kind: MantelKind; name: string }): Promise<{ id: string; code: string }> {
      const id = crypto.randomUUID()
      const pair = await generateMantelKeys()
      const secret = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES))
      await $fetch('/api/mantels', {
        method: 'POST',
        body: {
          id,
          ...input,
          publicKey: pair.publicKey,
          keeperWrap: await wrapMantelKeyForKeeper(await myPublicKey(), pair.privateKey, {
            mantelId: id,
            keeperId: me(),
          }),
          recoveryWrap: await wrapMantelKeyUnderCode(secret, id, pair.privateKey),
        },
      })
      return { id, code: formatRecoveryCode(secret) }
    },

    /** The key of the person waiting for a seat, and its fingerprint to compare. */
    async seatToFill(proposalId: string) {
      const seat = await $fetch<{ subjectId: string; publicKey: string }>(
        '/api/mantels/proposals/seat',
        { method: 'POST', body: { id: proposalId } },
      )
      return { ...seat, fingerprint: await keyFingerprint(seat.publicKey) }
    },

    /** Wraps the mantel's key to the new keeper, after the fingerprints matched. */
    async grant(
      proposalId: string,
      mantel: KeptMantel,
      seat: { subjectId: string; publicKey: string },
    ): Promise<boolean> {
      const mantelKey = await open(mantel)
      if (!mantelKey) return false
      await $fetch('/api/mantels/proposals/seat', {
        method: 'POST',
        body: {
          id: proposalId,
          wrapped: await wrapMantelKeyForKeeper(seat.publicKey, mantelKey, {
            mantelId: mantel.id,
            keeperId: seat.subjectId,
          }),
        },
      })
      return true
    },
  }
}
