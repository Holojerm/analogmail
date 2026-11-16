import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
}

// A pair today; members are their own table so a circle needs no migration.
export const correspondences = sqliteTable('correspondences', {
  id: id(),
  // Either member may close it. Nothing new can be posted afterwards.
  closedAt: integer('closed_at', { mode: 'timestamp' }),
  closedBy: text('closed_by'),
  ...timestamps,
})

export const correspondenceMembers = sqliteTable(
  'correspondence_members',
  {
    id: id(),
    correspondenceId: text('correspondence_id').notNull(),
    userId: text('user_id').notNull(),
    leftAt: integer('left_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('correspondence_members_pair_idx').on(table.correspondenceId, table.userId),
    index('correspondence_members_user_idx').on(table.userId),
  ],
)

// The invitation is the consent to correspond this way. It carries no letter.
export const invites = sqliteTable(
  'invites',
  {
    id: id(),
    inviterId: text('inviter_id').notNull(),
    // Cleared when the invite expires unaccepted: a non-user's address is not kept.
    inviteeEmail: text('invitee_email'),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
    acceptedBy: text('accepted_by'),
    correspondenceId: text('correspondence_id'),
    ...timestamps,
  },
  (table) => [
    index('invites_inviter_idx').on(table.inviterId),
    index('invites_expires_idx').on(table.expiresAt),
  ],
)

// A draft until sealed. Everything a reader would recognise as the letter
// (text, stationery, signature, the photo's key) is inside `ciphertext`.
export const letters = sqliteTable(
  'letters',
  {
    id: id(),
    correspondenceId: text('correspondence_id').notNull(),
    // Null once the author deletes their account: the letter belongs to its
    // recipient and stays.
    authorId: text('author_id'),
    inReplyTo: text('in_reply_to'),
    sealedAt: integer('sealed_at', { mode: 'timestamp' }),
    // Collected once the clock passes this; recall and edits end then.
    pickupAt: integer('pickup_at', { mode: 'timestamp' }),
    // The sender's calendar day, 'YYYY-MM-DD'.
    postmarkDate: text('postmark_date'),
    ciphertext: text('ciphertext').notNull(),
    // R2 key of the encrypted photo, if there is one.
    photoKey: text('photo_key'),
    // Version of the encryption scheme, so it can change without a guess.
    scheme: integer('scheme').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index('letters_correspondence_idx').on(table.correspondenceId),
    index('letters_author_idx').on(table.authorId),
  ],
)

// One row per reader: the letter's content key, wrapped to that reader's
// public key. A draft has only its author's row; sealing adds the recipient's.
export const letterKeys = sqliteTable(
  'letter_keys',
  {
    id: id(),
    letterId: text('letter_id').notNull(),
    userId: text('user_id').notNull(),
    wrappedKey: text('wrapped_key').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('letter_keys_reader_idx').on(table.letterId, table.userId),
    index('letter_keys_user_idx').on(table.userId),
  ],
)

export type Correspondence = typeof correspondences.$inferSelect
export type Invite = typeof invites.$inferSelect
export type Letter = typeof letters.$inferSelect
export type LetterKey = typeof letterKeys.$inferSelect
