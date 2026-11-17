// What happens to the account's keys when someone proves who they are. One
// function, no Nuxt, so each path can be read (and tested) in one place.
//
// `credentials:unlock` (layers/credentials) hands over whichever secret the
// person just used: the password's unlock key, or a passkey's PRF output.
// From that, in order:
//
//   1. No keys on the server yet: this is sign-up. Make the key pair, wrap it
//      under the password and a new recovery code.
//   2. Get the private key: this device's copy, else a wrap the secret opens.
//   3. With the private key in hand, make sure the secret just used has a
//      wrap, so it opens the key on the next device too.

import {
  formatRecoveryCode,
  RECOVERY_CODE_BYTES,
  type WrapKind,
} from '../../shared/utils/key-format'
import {
  exportPrivateKey,
  generateAccountKeys,
  importPrivateKey,
  publicKeyOf,
  type WrapContext,
  unwrapPrivateKey,
  wrapPrivateKey,
} from './key-crypto'
import type { DeviceKey } from './key-store'

type Bytes = Uint8Array<ArrayBuffer>

export interface StoredWrap {
  kind: WrapKind
  credentialId: string
  wrapped: string
}

export interface StoredKeys {
  publicKey: string
  wraps: StoredWrap[]
}

/** The secrets one proof of identity carries. See CredentialsUnlock. */
export interface UnlockSecrets {
  userId: string
  unlockKey: Uint8Array | null
  previousUnlockKey: Uint8Array | null
  passkey: { credentialId: string; prf: Uint8Array | null } | null
  /** True when the password was just replaced, so its wrap must be too. */
  passwordReplaced: boolean
}

/** Everything the function touches outside itself. */
export interface KeyBackend {
  fetchKeys(): Promise<StoredKeys | null>
  createKeys(input: {
    publicKey: string
    passwordWrap: string
    recoveryWrap: string
  }): Promise<void>
  putWrap(wrap: StoredWrap): Promise<void>
  loadDevice(userId: string): Promise<DeviceKey | null>
  saveDevice(key: DeviceKey): Promise<void>
}

export type UnlockOutcome =
  | { status: 'ready'; recoveryCode?: string }
  /** The account has keys, and nothing offered here opens them. */
  | { status: 'locked' }
  /** No keys yet and no password to make them with. */
  | { status: 'none' }

const bytes = (value: Uint8Array) => new Uint8Array(value) as Bytes

export function newRecoveryCode(): { code: string; secret: Bytes } {
  const secret = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES))
  return { code: formatRecoveryCode(secret), secret }
}

export async function applyUnlock(
  secrets: UnlockSecrets,
  backend: KeyBackend,
): Promise<UnlockOutcome> {
  const { userId } = secrets
  const stored = await backend.fetchKeys()
  const unlockKey = secrets.unlockKey && bytes(secrets.unlockKey)

  if (!stored) {
    if (!unlockKey) return { status: 'none' }
    const keys = await generateAccountKeys()
    const recovery = newRecoveryCode()
    await backend.createKeys({
      publicKey: keys.publicKey,
      passwordWrap: await wrapPrivateKey(unlockKey, { userId, kind: 'password' }, keys.privateKey),
      recoveryWrap: await wrapPrivateKey(
        recovery.secret,
        { userId, kind: 'recovery' },
        keys.privateKey,
      ),
    })
    await backend.saveDevice({
      userId,
      publicKey: keys.publicKey,
      privateKey: await importPrivateKey(keys.privateKey),
    })
    return { status: 'ready', recoveryCode: recovery.code }
  }

  const find = (kind: WrapKind, credentialId = '') =>
    stored.wraps.find((wrap) => wrap.kind === kind && wrap.credentialId === credentialId)
  const open = async (secret: Uint8Array | null, context: WrapContext) => {
    const wrap = find(context.kind, context.credentialId)
    return secret && wrap ? unwrapPrivateKey(bytes(secret), context, wrap.wrapped) : null
  }
  const password: WrapContext = { userId, kind: 'password' }
  const passkey: WrapContext | null = secrets.passkey && {
    userId,
    kind: 'passkey',
    credentialId: secrets.passkey.credentialId,
  }

  const kept = await backend.loadDevice(userId)
  const device = kept?.publicKey === stored.publicKey ? kept : null
  const privateKey =
    (device && (await exportPrivateKey(device.privateKey))) ??
    (await open(secrets.unlockKey, password)) ??
    (await open(secrets.previousUnlockKey, password)) ??
    (passkey && (await open(secrets.passkey!.prf, passkey)))
  if (!privateKey) return { status: 'locked' }

  // The key this device opened must be the other half of the public key the
  // server gives for the account. If the server's row was swapped, nothing is
  // kept and nothing is wrapped to it.
  const imported = await importPrivateKey(privateKey)
  const publicKey = await publicKeyOf(imported)
  if (publicKey !== stored.publicKey) return { status: 'locked' }

  if (!device) await backend.saveDevice({ userId, publicKey, privateKey: imported })

  // The wraps are a convenience for the next device; failing to save one must
  // not undo an unlock that has already worked.
  try {
    const passwordOpens = unlockKey && (await open(unlockKey, password))
    if (unlockKey && (secrets.passwordReplaced || !passwordOpens)) {
      const wrapped = await wrapPrivateKey(unlockKey, password, privateKey)
      await backend.putWrap({ kind: 'password', credentialId: '', wrapped })
    }
    if (passkey && secrets.passkey!.prf && !find('passkey', passkey.credentialId)) {
      const wrapped = await wrapPrivateKey(bytes(secrets.passkey!.prf), passkey, privateKey)
      await backend.putWrap({ kind: 'passkey', credentialId: passkey.credentialId!, wrapped })
    }
  } catch {
    // Tried again the next time this secret is used.
  }
  return { status: 'ready' }
}
