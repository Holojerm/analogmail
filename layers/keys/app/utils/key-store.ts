// Where this device keeps the private key between visits: one record in
// IndexedDB, removed on sign-out. Without it every page load would ask for
// the password again.
//
// The key is stored extractable, so this device can wrap it again for a new
// passkey, a changed password or a new recovery code without asking for a
// secret it no longer holds. The cost: a script running in the page could
// read it. That is the same boundary as the rest of the design, which
// protects what the server stores and does not claim to survive altered code.

const DATABASE = 'analogmail-keys'
const STORE = 'keys'
const SLOT = 'account'

export interface DeviceKey {
  userId: string
  /** SPKI, base64url. Checked against the server's copy before use. */
  publicKey: string
  privateKey: CryptoKey
}

// Private browsing can refuse IndexedDB. The key then lasts until the page is closed.
let inMemory: DeviceKey | null = null

function request<T>(action: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode) {
  return new Promise<T>((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, 1)
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE)
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const database = opening.result
      const pending = action(database.transaction(STORE, mode).objectStore(STORE))
      pending.onerror = () => reject(pending.error)
      pending.onsuccess = () => resolve(pending.result)
      pending.transaction!.oncomplete = () => database.close()
    }
  })
}

/** The key kept for this person, or null. Another person's key is removed. */
export async function loadDeviceKey(userId: string): Promise<DeviceKey | null> {
  let kept = inMemory
  try {
    kept =
      ((await request((store) => store.get(SLOT), 'readonly')) as DeviceKey | undefined) ?? kept
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
  try {
    await request((store) => store.put(key, SLOT), 'readwrite')
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
