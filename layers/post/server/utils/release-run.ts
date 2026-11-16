// The release run. Everyone whose delivery hour has come gets the mail that
// is due, and at most one notice. Called every 15 minutes by
// layers/post/server/tasks/release-mail.ts and by the dev clock after a jump.
//
// It takes the Drizzle client and `now` so the workerd suite can drive it
// against a real D1 at any instant (layers/post/test/release-run.test.ts).
//
// The whole run is a handful of D1 round trips however many people are due:
// one select of profiles, one of their waiting mail, then the writes in
// batches. Each person's writes stay inside one batch, and a batch is one
// transaction, so a person is never half released. Every write is safe to
// repeat: a delivered letter is not delivered again, the notice is unique per
// person per day, and a released date is never a candidate twice.

import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { drizzle } from 'drizzle-orm/d1'
import * as tables from '@nuxthub/db/schema'

import { recordOpsEvent } from '#server/utils/ops'

import { localParts } from '../../shared/utils/calendar'
import {
  isDue,
  nextRelease,
  planRelease,
  settle,
  type Release,
  type ReleaseState,
} from '../../shared/utils/release'
import type { PostalProfile } from '../db/schema'

export type PostDb = ReturnType<typeof drizzle<typeof tables>>
type Statement = BatchItem<'sqlite'>

/** People handled per run. The rest are still due at the next one. */
export const RELEASE_RUN_LIMIT = 200
// D1 allows 100 bound parameters in a statement.
const IN_LIST = 80
const BATCH_STATEMENTS = 60
const DAY_MS = 24 * 60 * 60 * 1000

export interface ReleaseReport {
  /** People whose delivery hour had come. */
  due: number
  delivered: number
  notices: number
  /** People whose profile could not be scheduled; retried in a day. */
  failed: number
  truncated: boolean
}

export function releaseStateOf(profile: PostalProfile): ReleaseState {
  return {
    zone: profile.timeZone,
    current: { mailDays: profile.mailDays, hour: profile.deliveryHour },
    pending: profile.pendingFrom
      ? {
          mailDays: profile.pendingMailDays ?? profile.mailDays,
          hour: profile.pendingDeliveryHour ?? profile.deliveryHour,
          from: profile.pendingFrom,
        }
      : null,
    lastReleaseDate: profile.lastReleaseDate,
  }
}

function settingsColumns(state: ReleaseState) {
  return {
    mailDays: state.current.mailDays,
    deliveryHour: state.current.hour,
    pendingMailDays: state.pending?.mailDays ?? null,
    pendingDeliveryHour: state.pending?.hour ?? null,
    pendingFrom: state.pending?.from ?? null,
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}

interface Turn {
  userId: string
  state: ReleaseState
  release: Release
  due: boolean
}

type Waiting = Map<string, { id: string; earliestDate: string }[]>

async function waitingMail(db: PostDb, turns: Turn[]): Promise<Waiting> {
  const { deliveries } = tables
  const waiting: Waiting = new Map()
  for (const group of chunk(turns, IN_LIST)) {
    const latest = group.reduce(
      (max, turn) => (turn.release.date > max ? turn.release.date : max),
      '',
    )
    const rows = await db
      .select({
        id: deliveries.id,
        recipientId: deliveries.recipientId,
        earliestDate: deliveries.earliestDate,
      })
      .from(deliveries)
      .where(
        and(
          inArray(
            deliveries.recipientId,
            group.map((turn) => turn.userId),
          ),
          eq(deliveries.state, 'in_transit'),
          lte(deliveries.earliestDate, latest),
        ),
      )
    for (const row of rows) {
      waiting.set(row.recipientId, [...(waiting.get(row.recipientId) ?? []), row])
    }
  }
  return waiting
}

export async function runRelease(
  db: PostDb,
  now: Date,
  options: { limit?: number } = {},
): Promise<ReleaseReport> {
  const { postalProfiles, deliveries, notices } = tables
  const limit = options.limit ?? RELEASE_RUN_LIMIT
  const rows = await db
    .select()
    .from(postalProfiles)
    .where(or(isNull(postalProfiles.nextReleaseAt), lte(postalProfiles.nextReleaseAt, now)))
    .orderBy(asc(postalProfiles.nextReleaseAt))
    .limit(limit + 1)

  const report: ReleaseReport = {
    due: 0,
    delivered: 0,
    notices: 0,
    failed: 0,
    truncated: rows.length > limit,
  }
  const whose = (userId: string) => eq(postalProfiles.userId, userId)
  const turns: Turn[] = []
  const groups: Statement[][] = []

  for (const profile of rows.slice(0, limit)) {
    try {
      const today = localParts(now, profile.timeZone).date
      const state = settle(releaseStateOf(profile), today)
      const release = nextRelease(now, state)
      turns.push({ userId: profile.userId, state, release, due: isDue(release, now) })
    } catch (err) {
      // A profile that cannot be scheduled (an unknown zone, an empty mask)
      // would otherwise be picked up, and reported, every 15 minutes.
      report.failed += 1
      groups.push([
        db
          .update(postalProfiles)
          .set({ nextReleaseAt: new Date(now.getTime() + DAY_MS) })
          .where(whose(profile.userId)),
      ])
      await recordOpsEvent(db, {
        kind: 'release_profile_failed',
        detail: `${profile.userId}: ${String(err)}`,
      })
    }
  }

  const dueTurns = turns.filter((turn) => turn.due)
  report.due = dueTurns.length
  const waiting = dueTurns.length > 0 ? await waitingMail(db, dueTurns) : new Map()

  for (const turn of turns) {
    const settings = settingsColumns(turn.state)
    if (!turn.due) {
      // Unscheduled, or the run slipped past the day it was due on: the mail
      // waits for the next mail day rather than arriving late.
      groups.push([
        db
          .update(postalProfiles)
          .set({ ...settings, nextReleaseAt: turn.release.at })
          .where(whose(turn.userId)),
      ])
      continue
    }
    const plan = planRelease(waiting.get(turn.userId) ?? [], turn.release.date)
    const group: Statement[] = chunk(plan.deliver, IN_LIST).map((ids) =>
      db
        .update(deliveries)
        .set({ state: 'delivered', deliveredAt: now, mailDate: turn.release.date })
        .where(and(inArray(deliveries.id, ids), eq(deliveries.state, 'in_transit'))),
    )
    if (plan.notify) {
      group.push(
        db
          .insert(notices)
          // Queued on the post office clock, which is what the notice's
          // expiry is measured against.
          .values({ userId: turn.userId, mailDate: turn.release.date, createdAt: now })
          .onConflictDoNothing(),
      )
    }
    const next = nextRelease(now, { ...turn.state, lastReleaseDate: turn.release.date })
    group.push(
      db
        .update(postalProfiles)
        .set({ ...settings, lastReleaseDate: turn.release.date, nextReleaseAt: next.at })
        .where(whose(turn.userId)),
    )
    groups.push(group)
    report.delivered += plan.deliver.length
    report.notices += plan.notify ? 1 : 0
  }

  let batch: Statement[] = []
  const flush = async () => {
    if (batch.length > 0) await db.batch(batch as [Statement, ...Statement[]])
    batch = []
  }
  for (const group of groups) {
    if (batch.length + group.length > BATCH_STATEMENTS) await flush()
    batch.push(...group)
  }
  await flush()

  return report
}
