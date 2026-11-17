// The unlock paths, with the server and the device's store played by memory.

import { describe, expect, it } from 'vitest'

import { exportPrivateKey, publicKeyOf } from '../app/utils/key-crypto'
import { openWithRecoveryCode, replaceRecoveryCode } from '../app/utils/key-recovery'
import type { DeviceKey } from '../app/utils/key-store'
import {
  applyUnlock,
  type KeyBackend,
  type StoredKeys,
  type UnlockSecrets,
} from '../app/utils/key-unlock'

const secret = (fill: number) => new Uint8Array(32).fill(fill)
const PASSWORD = secret(1)
const NEW_PASSWORD = secret(2)
const PRF = secret(3)

/** One account on the server. Each `device()` is a browser with its own store. */
function account() {
  const server: { keys: StoredKeys | null } = { keys: null }
  const device = (): KeyBackend & { held: () => DeviceKey | null } => {
    let kept: DeviceKey | null = null
    return {
      held: () => kept,
      fetchKeys: async () => server.keys && structuredClone(server.keys),
      async createKeys(input) {
        server.keys = {
          publicKey: input.publicKey,
          wraps: [
            { kind: 'password', credentialId: '', wrapped: input.passwordWrap },
            { kind: 'recovery', credentialId: '', wrapped: input.recoveryWrap },
          ],
        }
      },
      async putWrap(wrap) {
        const same = (other: typeof wrap) =>
          other.kind === wrap.kind && other.credentialId === wrap.credentialId
        server.keys!.wraps = [...server.keys!.wraps.filter((other) => !same(other)), wrap]
      },
      loadDevice: async () => kept,
      async saveDevice(key) {
        kept = key
      },
    }
  }
  const kinds = () =>
    server
      .keys!.wraps.map((wrap) => wrap.kind)
      .sort()
      .join(' ')
  /** What the server's reset hook does. */
  const resetPassword = () => {
    server.keys!.wraps = server.keys!.wraps.filter((wrap) => wrap.kind !== 'password')
  }
  return { server, device, kinds, resetPassword }
}

const withPassword = (unlockKey: Uint8Array, more: Partial<UnlockSecrets> = {}): UnlockSecrets => ({
  userId: 'ann',
  unlockKey,
  previousUnlockKey: null,
  passkey: null,
  passwordReplaced: false,
  ...more,
})
const withPasskey = (prf: Uint8Array | null, credentialId = 'passkey-1'): UnlockSecrets => ({
  userId: 'ann',
  unlockKey: null,
  previousUnlockKey: null,
  passkey: { credentialId, prf },
  passwordReplaced: false,
})

async function signedUp() {
  const world = account()
  const first = world.device()
  const outcome = await applyUnlock(withPassword(PASSWORD), first)
  if (outcome.status !== 'ready' || !outcome.recoveryCode) throw new Error('sign-up failed')
  const privateKey = await exportPrivateKey(first.held()!.privateKey)
  return { ...world, first, recoveryCode: outcome.recoveryCode, privateKey }
}
const keyOn = async (device: { held: () => DeviceKey | null }) =>
  device.held() && (await exportPrivateKey(device.held()!.privateKey))

describe('sign-up', () => {
  it('makes the key pair, two wraps and a recovery code', async () => {
    const { kinds, recoveryCode, first } = await signedUp()

    expect(kinds()).toBe('password recovery')
    expect(recoveryCode).toMatch(/^(\w{4}-){7}\w{4}$/)
    expect(first.held()!.userId).toBe('ann')
  })

  it('cannot happen from a passkey alone', async () => {
    const { device, server } = account()

    expect(await applyUnlock(withPasskey(PRF), device())).toEqual({ status: 'none' })
    expect(server.keys).toBeNull()
  })
})

describe('the password', () => {
  it('opens the key on a second device, with no new recovery code', async () => {
    const { device, privateKey } = await signedUp()
    const second = device()

    expect(await applyUnlock(withPassword(PASSWORD), second)).toEqual({ status: 'ready' })
    expect(await keyOn(second)).toEqual(privateKey)
  })

  it('leaves a new device locked when it is wrong', async () => {
    const { device } = await signedUp()
    const second = device()

    expect(await applyUnlock(withPassword(NEW_PASSWORD), second)).toEqual({ status: 'locked' })
    expect(second.held()).toBeNull()
  })

  it('is re-wrapped when it changes, on a device that never held the key', async () => {
    const { device, privateKey } = await signedUp()
    const second = device()

    await applyUnlock(
      withPassword(NEW_PASSWORD, { previousUnlockKey: PASSWORD, passwordReplaced: true }),
      second,
    )

    const third = device()
    expect(await applyUnlock(withPassword(PASSWORD), third)).toEqual({ status: 'locked' })
    expect(await applyUnlock(withPassword(NEW_PASSWORD), third)).toEqual({ status: 'ready' })
    expect(await keyOn(third)).toEqual(privateKey)
  })
})

describe('a password reset by email', () => {
  it('keeps the letters on a device that still holds the key, and wraps it again', async () => {
    const { first, device, resetPassword, kinds } = await signedUp()
    resetPassword()

    const outcome = await applyUnlock(withPassword(NEW_PASSWORD, { passwordReplaced: true }), first)

    expect(outcome).toEqual({ status: 'ready' })
    expect(kinds()).toBe('password recovery')
    expect(await applyUnlock(withPassword(NEW_PASSWORD), device())).toEqual({ status: 'ready' })
  })

  it('leaves a new device locked until the recovery code is typed', async () => {
    const { device, resetPassword, recoveryCode, privateKey, kinds } = await signedUp()
    resetPassword()
    const fresh = device()
    const reset = withPassword(NEW_PASSWORD, { passwordReplaced: true })

    expect(await applyUnlock(reset, fresh)).toEqual({ status: 'locked' })
    expect(
      await openWithRecoveryCode('0000-0000-0000-0000-0000-0000-0000-0000', 'ann', fresh),
    ).toBe(false)
    expect(await openWithRecoveryCode(recoveryCode.toLowerCase(), 'ann', fresh)).toBe(true)
    expect(await keyOn(fresh)).toEqual(privateKey)

    // The next time the new password is typed, it gets its wrap back.
    await applyUnlock(withPassword(NEW_PASSWORD), fresh)
    expect(kinds()).toBe('password recovery')
    expect(await applyUnlock(withPassword(NEW_PASSWORD), device())).toEqual({ status: 'ready' })
  })
})

describe('a passkey', () => {
  it('gets a wrap when it is added, and then opens the key on a new device', async () => {
    const { first, device, kinds, privateKey } = await signedUp()

    await applyUnlock(withPasskey(PRF), first)
    expect(kinds()).toBe('passkey password recovery')

    const second = device()
    expect(await applyUnlock(withPasskey(PRF), second)).toEqual({ status: 'ready' })
    expect(await keyOn(second)).toEqual(privateKey)
  })

  it('signs in but opens nothing without the PRF secret', async () => {
    const { first, device, kinds } = await signedUp()
    await applyUnlock(withPasskey(null), first)

    expect(kinds()).toBe('password recovery')
    expect(await applyUnlock(withPasskey(null), device())).toEqual({ status: 'locked' })
  })

  it("does not open with another passkey's secret", async () => {
    const { first, device } = await signedUp()
    await applyUnlock(withPasskey(PRF), first)

    expect(await applyUnlock(withPasskey(PRF, 'passkey-2'), device())).toEqual({ status: 'locked' })
    expect(await applyUnlock(withPasskey(secret(9)), device())).toEqual({ status: 'locked' })
  })
})

describe('a new recovery code', () => {
  it('replaces the old one, which stops working', async () => {
    const { first, device, recoveryCode } = await signedUp()

    const next = await replaceRecoveryCode('ann', first)

    expect(next).not.toBe(recoveryCode)
    expect(await openWithRecoveryCode(recoveryCode, 'ann', device())).toBe(false)
    expect(await openWithRecoveryCode(next!, 'ann', device())).toBe(true)
  })

  it('cannot be made on a device that does not hold the key', async () => {
    const { device } = await signedUp()

    expect(await replaceRecoveryCode('ann', device())).toBeNull()
  })
})

describe('a public key the server swapped', () => {
  it('is refused: nothing is kept, and the device stays locked', async () => {
    const { server, device } = await signedUp()
    const other = await signedUp()
    server.keys!.publicKey = other.server.keys!.publicKey
    const second = device()

    expect(await applyUnlock(withPassword(PASSWORD), second)).toEqual({ status: 'locked' })
    expect(second.held()).toBeNull()
  })

  it('is not what a device wraps to: its own key gives its own public key', async () => {
    const { server, first } = await signedUp()
    expect(await publicKeyOf(first.held()!.privateKey)).toBe(server.keys!.publicKey)
    expect(first.held()!.publicKey).toBe(server.keys!.publicKey)
  })
})

describe('a device', () => {
  it('ignores a kept key that is not the one the account has', async () => {
    const { device } = await signedUp()
    const other = await signedUp()
    const confused = device()
    await confused.saveDevice(other.first.held()!)

    expect(await applyUnlock(withPassword(NEW_PASSWORD), confused)).toEqual({ status: 'locked' })
  })
})
