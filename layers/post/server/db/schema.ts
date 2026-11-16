import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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

// The list a person picks their city from. GeoNames data (CC BY 4.0); the
// id is the GeoNames id. Coordinates are the city centre, never a device's.
export const cities = sqliteTable(
  'cities',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    // Lower-case ASCII, for prefix search.
    searchName: text('search_name').notNull(),
    region: text('region'),
    country: text('country').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    timeZone: text('time_zone').notNull(),
    population: integer('population').notNull().default(0),
  },
  (table) => [index('cities_search_idx').on(table.searchName)],
)

// Where and when a person takes delivery. The place is copied from `cities`
// so a re-import of the list never moves anyone.
export const postalProfiles = sqliteTable(
  'postal_profiles',
  {
    userId: text('user_id').primaryKey(),
    cityId: integer('city_id'),
    cityName: text('city_name').notNull(),
    country: text('country').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    // Applies the moment it changes.
    timeZone: text('time_zone').notNull(),
    // 6-bit mask, Monday is bit 0. See layers/post/shared/utils/mail-days.ts.
    mailDays: integer('mail_days').notNull().default(63),
    deliveryHour: integer('delivery_hour').notNull().default(10),
    // A change to mail days or hour waits here until `pendingFrom`, a
    // 'YYYY-MM-DD' in the person's own zone, so today's release never moves.
    pendingMailDays: integer('pending_mail_days'),
    pendingDeliveryHour: integer('pending_delivery_hour'),
    pendingFrom: text('pending_from'),
    // 'YYYY-MM-DD'. No date is released twice, whatever the zone does.
    lastReleaseDate: text('last_release_date'),
    // What the release task selects on.
    nextReleaseAt: integer('next_release_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (table) => [index('postal_profiles_next_release_idx').on(table.nextReleaseAt)],
)

// One letter travelling to one person. `kind` is 'letter' or 'return'
// (a letter going back to its author); `state` is 'in_transit', 'delivered'
// or 'returned'.
//
// `deliveredAt`, `mailDate` and `openedAt` exist for the recipient's own mantel. No
// query may return them, or anything derived from them, to anyone else.
export const deliveries = sqliteTable(
  'deliveries',
  {
    id: id(),
    letterId: text('letter_id').notNull(),
    recipientId: text('recipient_id').notNull(),
    kind: text('kind').notNull().default('letter'),
    // Both 'YYYY-MM-DD' on the recipient's calendar, fixed at the postmark.
    earliestDate: text('earliest_date').notNull(),
    promisedDate: text('promised_date').notNull(),
    transitDays: integer('transit_days').notNull(),
    state: text('state').notNull().default('in_transit'),
    deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
    // The release it arrived with, 'YYYY-MM-DD' on the recipient's calendar.
    // Ties a letter to that day's notice, so a bounced notice returns it.
    mailDate: text('mail_date'),
    openedAt: integer('opened_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('deliveries_letter_recipient_idx').on(
      table.letterId,
      table.recipientId,
      table.kind,
    ),
    index('deliveries_due_idx').on(table.recipientId, table.state, table.earliestDate),
  ],
)

// "Something arrived on your mantel." The unique index is what makes it one notice per person
// per mail day however often the release task is retried.
export const notices = sqliteTable(
  'notices',
  {
    id: id(),
    userId: text('user_id').notNull(),
    // 'YYYY-MM-DD' on the recipient's calendar.
    mailDate: text('mail_date').notNull(),
    channel: text('channel').notNull().default('email'),
    // 'pending', 'sending', 'sent', 'failed' or 'bounced'.
    state: text('state').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    sentAt: integer('sent_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('notices_user_date_idx').on(table.userId, table.mailDate),
    index('notices_state_idx').on(table.state),
  ],
)

export type City = typeof cities.$inferSelect
export type PostalProfile = typeof postalProfiles.$inferSelect
export type Delivery = typeof deliveries.$inferSelect
export type Notice = typeof notices.$inferSelect
