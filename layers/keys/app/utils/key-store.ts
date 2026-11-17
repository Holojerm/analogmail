// Where this device keeps the private key between visits: one record in
// IndexedDB, removed on sign-out. Without it every page load would ask for
// the password again.
//
// The key is stored extractable, so this device can wrap it again for a new
// passkey, a changed password or a new recovery code without asking for a
// secret it no longer holds. The cost: a script running in the page could
// read it. That is the same boundary as the rest of the design, which
// protects what the server stores and does not claim to survive altered code.

import { exportPrivateKey, importPrivateKey } from './key-crypto'

const DATABASE = 'dearmantel-keys'
const STORE = 'keys'
const SLOT = 'account'

export interface DeviceKey {
  userId: string
  /** SPKI, base64url. Checked against the server's copy before use. */
  publicKey: string
  privateKey: CryptoKey
}

/**
 * What is written to IndexedDB. Normally the key itself. Safari in Private
 * Browsing, and the browsers built into other apps, cannot store a CryptoKey
 * ("The object can not be cloned"), so there the key's bytes are stored
 * instead. That is no weaker: the key is extractable either way.
 */
interface StoredKey {
  userId: string
  publicKey: string
  privateKey?: CryptoKey
  pkcs8?: Uint8Array<ArrayBuffer>
}

// A browser can also refuse IndexedDB altogether. The key then lasts until the
// page is closed.
let inMemory: DeviceKey | null = null

function request<T>(action: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode) {
  return new Promise<T>((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, 1)
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE)
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const database = opening.result
      try {
        const pending = action(database.transaction(STORE, mode).objectStore(STORE))
        pending.onerror = () => reject(pending.error)
        pending.onsuccess = () => resolve(pending.result)
        pending.transaction!.oncomplete = () => database.close()
      } catch (error) {
        // `put` throws here, not through `onerror`, when a value cannot be
        // stored. Unreported, the promise would never settle and sign-up
        // would hang on a blank step.
        database.close()
        reject(error)
      }
    }
  })
}

/** The key kept for this person, or null. Another person's key is removed. */
export async function loadDeviceKey(userId: string): Promise<DeviceKey | null> {
  let kept = inMemory
  try {
    const stored = (await request((store) => store.get(SLOT), 'readonly')) as StoredKey | undefined
    if (stored?.privateKey) {
      kept = { userId: stored.userId, publicKey: stored.publicKey, privateKey: stored.privateKey }
    } else if (stored?.pkcs8) {
      kept = {
        userId: stored.userId,
        publicKey: stored.publicKey,
        privateKey: await importPrivateKey(stored.pkcs8),
      }
    }
  } catch {
    // Fall through to whatever is in memory.
  }
  if (kept && kept.userId !== userId) {
    await clearDeviceKey()
    return null
  }
  return kept
}

export async function saveDeviceKey(key: DeviceKey): Promise<void> {
  inMemory = key
  const { userId, publicKey, privateKey } = key
  try {
    await request((store) => store.put({ userId, publicKey, privateKey }, SLOT), 'readwrite')
    return
  } catch {
    // This browser will not store a CryptoKey: store its bytes instead.
  }
  try {
    const pkcs8 = await exportPrivateKey(privateKey)
    await request((store) => store.put({ userId, publicKey, pkcs8 }, SLOT), 'readwrite')
  } catch {
    // Kept in memory only.
  }
}

export async function clearDeviceKey(): Promise<void> {
  inMemory = null
  try {
    await request((store) => store.delete(SLOT), 'readwrite')
  } catch {
    // Nothing was stored.
  }
}
