// Runs before core's teardown deletes the e2e-* users, while their ids can
// still be looked up: what this layer's spec created for them goes first.
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DB_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.data/db/sqlite.db')

const E2E_USERS = "SELECT id FROM users WHERE email LIKE 'e2e-%'"

export default function globalTeardown(): void {
  if (!existsSync(DB_PATH)) return

  const db = new DatabaseSync(DB_PATH)
  try {
    db.exec(`DELETE FROM room_checkins WHERE user_id IN (${E2E_USERS})`)
    db.exec(`DELETE FROM room_photos WHERE uploaded_by IN (${E2E_USERS})`)
    db.exec(`DELETE FROM room_albums WHERE created_by IN (${E2E_USERS})`)
  } finally {
    db.close()
  }
}
