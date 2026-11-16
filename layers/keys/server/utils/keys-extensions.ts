// What keys registers with core and with the credentials layer. Called once
// per isolate by layers/keys/server/plugins/keys.ts; tests call it directly.

import { and, count, eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { onCredentialsPasswordReset } from '#layers/credentials/server/utils/credentials-hooks'
import { registerAccountContributor } from '#server/utils/extensions'

export interface AccountExportKeys {
  /** The public half of the account's key pair, which letters are sealed to. */
  publicKey: string | null
  /**
   * What the private key is locked under. The locked copies stay on the
   * server: they are no use without the password, passkey or recovery code.
   */
  lockedUnder: { kind: string; addedAt: string }[]
}

declare module '#server/utils/extensions' {
  interface AccountExportSections {
    keys: AccountExportKeys
  }
}

export function registerKeysExtensions(): void {
  const { userKeys, keyWraps } = tables

  // A reset proves the mailbox, not the old password, so the old password's
  // wrap can never be opened again. It goes in the same batch as the new
  // password. The private key itself is untouched: a device that still holds
  // it, a passkey, or the recovery code brings it back, and letters with it.
  onCredentialsPasswordReset({
    key: 'keys',
    statements: (db, { userId }) => [
      db.delete(keyWraps).where(and(eq(keyWraps.userId, userId), eq(keyWraps.kind, 'password'))),
    ],
  })

  // Deleting the account deletes its keys. Letters it sent stay readable by
  // their recipients, who hold their own wrapped copy of each letter's key.
  registerAccountContributor({
    key: 'keys',
    async countForDeletion(db, userId) {
      const [row] = await db
        .select({ total: count() })
        .from(keyWraps)
        .where(eq(keyWraps.userId, userId))
      return row?.total ?? 0
    },
    async exportSection(db, userId) {
      const [key] = await db
        .select({ publicKey: userKeys.publicKey })
        .from(userKeys)
        .where(eq(userKeys.userId, userId))
        .limit(1)
      const wraps = await db
        .select({ kind: keyWraps.kind, createdAt: keyWraps.createdAt })
        .from(keyWraps)
        .where(eq(keyWraps.userId, userId))
      return {
        publicKey: key?.publicKey ?? null,
        lockedUnder: wraps.map((wrap) => ({
          kind: wrap.kind,
          addedAt: wrap.createdAt.toISOString(),
        })),
      }
    },
    deletionStatements: (db, userId) => [
      db.delete(keyWraps).where(eq(keyWraps.userId, userId)),
      db.delete(userKeys).where(eq(userKeys.userId, userId)),
    ],
  })
}
