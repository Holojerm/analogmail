import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
}

// One key pair per person. The public half is what letters are sealed to; it
// is set once and never replaced, because every letter already sealed to it
// would become unreadable.
export const userKeys = sqliteTable('user_keys', {
  userId: text('user_id').primaryKey(),
  // SPKI, base64url.
  publicKey: text('public_key').notNull(),
  // Version of the key and wrap scheme (layers/keys/app/utils/key-crypto.ts).
  scheme: integer('scheme').notNull().default(1),
  ...timestamps,
})

// The private half, encrypted in the browser under a secret the server never
// holds: the password's unlock key, one passkey's PRF output, or the recovery
// code. One row per secret. `credentialId` is '' except on a passkey's wrap.
export const keyWraps = sqliteTable(
  'key_wraps',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    credentialId: text('credential_id').notNull().default(''),
    wrapped: text('wrapped').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('key_wraps_secret_idx').on(table.userId, table.kind, table.credentialId),
    index('key_wraps_user_idx').on(table.userId),
  ],
)

export type UserKey = typeof userKeys.$inferSelect
export type KeyWrap = typeof keyWraps.$inferSelect
