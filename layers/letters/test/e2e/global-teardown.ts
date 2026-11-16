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
    const letters = `SELECT id FROM letters WHERE author_id IN (${E2E_USERS})`
    db.exec(`DELETE FROM deliveries WHERE letter_id IN (${letters})`)
    db.exec(`DELETE FROM letter_keys WHERE letter_id IN (${letters})`)
    db.exec(`DELETE FROM letters WHERE author_id IN (${E2E_USERS})`)
    db.exec(
      `DELETE FROM correspondences WHERE id IN (SELECT correspondence_id FROM correspondence_members WHERE user_id IN (${E2E_USERS}))`,
    )
    db.exec(`DELETE FROM correspondence_members WHERE user_id IN (${E2E_USERS})`)
    const kept = `SELECT id FROM mantels WHERE created_by IN (${E2E_USERS})`
    db.exec(
      `DELETE FROM mantel_votes WHERE proposal_id IN (SELECT id FROM mantel_proposals WHERE mantel_id IN (${kept}))`,
    )
    for (const table of ['mantel_proposals', 'mantel_key_wraps', 'mantel_keepers']) {
      db.exec(`DELETE FROM ${table} WHERE mantel_id IN (${kept})`)
    }
    db.exec(`DELETE FROM postal_profiles WHERE user_id IN (${kept})`)
    db.exec(`DELETE FROM correspondence_members WHERE user_id IN (${kept})`)
    db.exec(`DELETE FROM mantels WHERE created_by IN (${E2E_USERS})`)
    db.exec(`DELETE FROM invites WHERE inviter_id IN (${E2E_USERS})`)
    db.exec(`DELETE FROM people WHERE user_id IN (${E2E_USERS})`)
    db.exec(`DELETE FROM postal_profiles WHERE user_id IN (${E2E_USERS})`)
    db.exec(`DELETE FROM notices WHERE user_id IN (${E2E_USERS})`)
  } finally {
    db.close()
  }
}
