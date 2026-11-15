// Moving the dev clock forward. In real time the release runs every 15
// minutes, so nobody's delivery hour is ever stepped over; a jump has to run
// it at each hour it passes, or the people in between would miss their day.
// Imported only by the `.dev.ts` clock route (and its test).

import { and, eq, gt, lt, min } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { localParts } from '../../shared/utils/calendar'
import { nextRelease } from '../../shared/utils/release'
import { releaseStateOf, runRelease, type PostDb, type ReleaseReport } from '../utils/release-run'

const MAX_STOPS = 500

/**
 * After the clock goes back to real time, release dates recorded in the
 * simulated future would block every release until real time caught up.
 * Forget them and schedule everyone from `now`. Delivered mail stays delivered.
 */
export async function rescheduleAll(db: PostDb, now: Date): Promise<void> {
  const { postalProfiles } = tables
  for (const profile of await db.select().from(postalProfiles)) {
    const today = localParts(now, profile.timeZone).date
    const lastReleaseDate =
      profile.lastReleaseDate && profile.lastReleaseDate > today ? null : profile.lastReleaseDate
    const state = { ...releaseStateOf(profile), lastReleaseDate }
    await db
      .update(postalProfiles)
      .set({ lastReleaseDate, nextReleaseAt: nextRelease(now, state).at })
      .where(eq(postalProfiles.userId, profile.userId))
  }
}

export async function advanceTo(db: PostDb, from: Date, to: Date): Promise<ReleaseReport> {
  const { postalProfiles } = tables
  const total: ReleaseReport = { due: 0, delivered: 0, notices: 0, failed: 0, truncated: false }
  const run = async (at: Date) => {
    const report = await runRelease(db, at)
    total.due += report.due
    total.delivered += report.delivered
    total.notices += report.notices
    total.failed += report.failed
    total.truncated ||= report.truncated
  }

  let cursor = from
  for (let stop = 0; stop < MAX_STOPS; stop += 1) {
    const [next] = await db
      .select({ at: min(postalProfiles.nextReleaseAt) })
      .from(postalProfiles)
      .where(and(gt(postalProfiles.nextReleaseAt, cursor), lt(postalProfiles.nextReleaseAt, to)))
    if (!next?.at) break
    cursor = next.at
    await run(cursor)
  }
  await run(to)
  return total
}
