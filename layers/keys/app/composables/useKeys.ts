// The account's keys as the app sees them: whether this device holds the
// private key, and the actions that change that. The work is in
// ../utils/key-unlock.ts and key-recovery.ts; this binds it to the session,
// the API and the device's store.

import type { CredentialsUnlock } from '#layers/credentials/app/utils/credentials-unlock'

import { openWithRecoveryCode, replaceRecoveryCode } from '../utils/key-recovery'
import { clearDeviceKey, loadDeviceKey, saveDeviceKey } from '../utils/key-store'
import { applyUnlock, type KeyBackend, type StoredKeys } from '../utils/key-unlock'

/**
 * `unknown`  not checked yet
 * `none`     the account has no keys (it has never set a password)
 * `locked`   it has keys, and this device does not hold the private one
 * `ready`    this device can open letters
 */
export type KeysStatus = 'unknown' | 'none' | 'locked' | 'ready'

// Kept across a reload until the person confirms they wrote it down.
const PENDING_CODE = 'analogmail:recovery-code'

const backend: KeyBackend = {
  fetchKeys: async () => (await $fetch<{ keys: StoredKeys | null }>('/api/keys')).keys,
  createKeys: async (body) => void (await $fetch('/api/keys', { method: 'POST', body })),
  putWrap: async (body) => void (await $fetch('/api/keys/wraps', { method: 'PUT', body })),
  loadDevice: loadDeviceKey,
  saveDevice: saveDeviceKey,
}

function storedCode(): string | null {
  try {
    return import.meta.client ? sessionStorage.getItem(PENDING_CODE) : null
  } catch {
    return null
  }
}

export function useKeys() {
  const { user } = useUserSession()
  const status = useState<KeysStatus>('keys-status', () => 'unknown')
  /** A recovery code made and not yet confirmed as written down. */
  const recoveryCode = useState<string | null>('keys-recovery-code', storedCode)

  function showRecoveryCode(code: string) {
    recoveryCode.value = code
    try {
      sessionStorage.setItem(PENDING_CODE, code)
    } catch {
      // Shown from memory only.
    }
  }

  /** Works out `status` for the signed-in person. Client only. */
  async function refresh(): Promise<KeysStatus> {
    const userId = user.value?.id
    if (!userId) return (status.value = 'unknown')
    const stored = await backend.fetchKeys()
    if (!stored) return (status.value = 'none')
    const device = await loadDeviceKey(userId)
    return (status.value = device?.publicKey === stored.publicKey ? 'ready' : 'locked')
  }

  /**
   * The `credentials:unlock` listener. It never throws: by the time it runs
   * the person is signed in, and a failure here must leave them signed in
   * and locked, not looking at a sign-in error.
   */
  async function onUnlock(unlock: CredentialsUnlock): Promise<void> {
    try {
      const outcome = await applyUnlock(
        {
          userId: unlock.userId,
          unlockKey: unlock.unlockKey,
          previousUnlockKey: unlock.previousUnlockKey,
          passkey: unlock.passkey,
          passwordReplaced:
            unlock.reason === 'password-change' || unlock.reason === 'password-reset',
        },
        backend,
      )
      status.value = outcome.status
      if (outcome.status === 'ready' && outcome.recoveryCode) showRecoveryCode(outcome.recoveryCode)
    } catch {
      status.value = 'unknown'
    }
  }

  return {
    status: readonly(status),
    recoveryCode: readonly(recoveryCode),
    refresh,
    onUnlock,
    /** This device's private key, for opening letters. Null unless `ready`. */
    async privateKey(): Promise<CryptoKey | null> {
      const userId = user.value?.id
      return userId ? ((await loadDeviceKey(userId))?.privateKey ?? null) : null
    },
    async openWithRecoveryCode(code: string): Promise<boolean> {
      const userId = user.value?.id
      const opened = Boolean(userId) && (await openWithRecoveryCode(code, userId!, backend))
      if (opened) status.value = 'ready'
      return opened
    },
    /** Makes a new code and shows it; the old one stops working. */
    async replaceRecoveryCode(): Promise<boolean> {
      const userId = user.value?.id
      const code = userId ? await replaceRecoveryCode(userId, backend) : null
      if (code) showRecoveryCode(code)
      return Boolean(code)
    },
    confirmRecoveryCode() {
      recoveryCode.value = null
      try {
        sessionStorage.removeItem(PENDING_CODE)
      } catch {
        // Nothing was stored.
      }
    },
    /** Sign-out: this device stops holding the key. */
    async forget(): Promise<void> {
      await clearDeviceKey()
      status.value = 'unknown'
      recoveryCode.value = null
      try {
        sessionStorage.removeItem(PENDING_CODE)
      } catch {
        // Nothing was stored.
      }
    },
  }
}
