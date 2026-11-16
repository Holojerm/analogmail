// What the dev clock bar and /dev/post show. Imported only by the `.dev.ts`
// routes, so none of it is in a production build.

import { asc, count, desc, eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { clockOffsetMs } from '../utils/clock'
import type { PostDb } from '../utils/release-run'

function inZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant)
}

export async function officeSnapshot(db: PostDb) {
  const { postalProfiles, deliveries, notices, users } = tables
  const offsetMs = await clockOffsetMs()
  const now = new Date(Date.now() + offsetMs)

  const people = await db
    .select({ profile: postalProfiles, name: users.name })
    .from(postalProfiles)
    .leftJoin(users, eq(users.id, postalProfiles.userId))
    .orderBy(asc(postalProfiles.cityName))
  const counts = await db
    .select({ recipientId: deliveries.recipientId, state: deliveries.state, total: count() })
    .from(deliveries)
    .groupBy(deliveries.recipientId, deliveries.state)
  const outbox = await db
    .select({
      id: notices.id,
      to: users.name,
      mailDate: notices.mailDate,
      channel: notices.channel,
      state: notices.state,
    })
    .from(notices)
    .leftJoin(users, eq(users.id, notices.userId))
    .orderBy(desc(notices.createdAt))
    .limit(50)

  const tally = (userId: string, state: string) =>
    counts.find((row) => row.recipientId === userId && row.state === state)?.total ?? 0

  return {
    now: now.toISOString(),
    offsetMs,
    people: people.map(({ profile, name }) => ({
      userId: profile.userId,
      name: name ?? profile.userId,
      city: profile.cityName,
      localTime: inZone(now, profile.timeZone),
      nextDelivery: profile.nextReleaseAt ? inZone(profile.nextReleaseAt, profile.timeZone) : null,
      lastReleaseDate: profile.lastReleaseDate,
      inTransit: tally(profile.userId, 'in_transit'),
      delivered: tally(profile.userId, 'delivered'),
    })),
    outbox,
  }
}

export type OfficeSnapshot = Awaited<ReturnType<typeof officeSnapshot>>
