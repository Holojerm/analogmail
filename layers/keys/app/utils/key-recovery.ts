// The recovery code: the way back to the private key when the password was
// reset by email and no signed-in device or passkey still holds it.

import { parseRecoveryCode } from '../../shared/utils/key-format'
import { exportPrivateKey, importPrivateKey, unwrapPrivateKey, wrapPrivateKey } from './key-crypto'
import { newRecoveryCode, type KeyBackend } from './key-unlock'

/** True when the code opened the key and this device now holds it. */
export async function openWithRecoveryCode(
  code: string,
  userId: string,
  backend: KeyBackend,
): Promise<boolean> {
  const secret = parseRecoveryCode(code)
  const stored = await backend.fetchKeys()
  const wrap = stored?.wraps.find((entry) => entry.kind === 'recovery')
  if (!secret || !stored || !wrap) return false
  const privateKey = await unwrapPrivateKey(secret, { userId, kind: 'recovery' }, wrap.wrapped)
  if (!privateKey) return false
  await backend.saveDevice({
    userId,
    publicKey: stored.publicKey,
    privateKey: await importPrivateKey(privateKey),
  })
  return true
}

/**
 * A new code, replacing the old one, which stops working. Needs the private
 * key on this device; null when it is not here.
 */
export async function replaceRecoveryCode(
  userId: string,
  backend: KeyBackend,
): Promise<string | null> {
  const device = await backend.loadDevice(userId)
  if (!device) return null
  const { code, secret } = newRecoveryCode()
  const wrapped = await wrapPrivateKey(
    secret,
    { userId, kind: 'recovery' },
    await exportPrivateKey(device.privateKey),
  )
  await backend.putWrap({ kind: 'recovery', credentialId: '', wrapped })
  return code
}
