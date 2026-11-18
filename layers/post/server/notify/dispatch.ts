// Sends the notices the release run queued. Runs straight after it, every 15
// minutes.
//
// At most once: a notice is marked `sending` before the channel is called, so
// a crash between the two loses that notice rather than sending it twice. A
// send that fails is tried again on later runs, up to NOTICE_MAX_ATTEMPTS,
// which is a retry and not a reminder. A notice that could not be sent within
// NOTICE_EXPIRY_MS is dropped: a flag for mail that arrived yesterday is noise.

import { and, asc, eq, inArray, lt } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { recordOpsEvent } from '#server/utils/ops'
import { isUndeliverableAddress } from '#server/utils/users'

import type { PostDb } from '../utils/release-run'
import type { Notifier, NotifyResult } from './notifier'

export const NOTICE_MAX_ATTEMPTS = 3
export const NOTICE_EXPIRY_MS = 12 * 60 * 60 * 1000
export const NOTICE_RUN_LIMIT = 100

export interface NoticeReport {
  sent: number
  /** Devices that took the notice as a notification, beside the channel's own send. */
  pushed: number
  /** Failed this time and will be tried again. */
  retrying: number
  failed: number
  expired: number
  /** The channel is not configured; pending notices wait. */
  skipped: boolean
}

export async function dispatchNotices(
  db: PostDb,
  notifier: Notifier,
  now: Date,
  options: {
    limit?: number
    /**
     * The same notice on the devices a person turned notifications on in
     * (./push.ts). Resolves to how many took it. Beside the channel, not
     * instead of it: a notification is easy to miss and has never failed loudly.
     */
    push?: (userId: string) => Promise<number>
  } = {},
): Promise<NoticeReport> {
  const { notices, users } = tables
  const report: NoticeReport = {
    sent: 0,
    pushed: 0,
    retrying: 0,
    failed: 0,
    expired: 0,
    skipped: false,
  }
  const settle = (id: string, values: Partial<typeof notices.$inferInsert>) =>
    db.update(notices).set(values).where(eq(notices.id, id))

  const expired = await db
    .update(notices)
    .set({ state: 'failed' })
    .where(
      and(
        inArray(notices.state, ['pending', 'sending']),
        lt(notices.createdAt, new Date(now.getTime() - NOTICE_EXPIRY_MS)),
      ),
    )
    .returning({ id: notices.id })
  report.expired = expired.length

  if (!notifier.ready()) return { ...report, skipped: true }

  const pending = await db
    .select({
      id: notices.id,
      userId: notices.userId,
      attempts: notices.attempts,
      email: users.email,
    })
    .from(notices)
    .leftJoin(users, eq(users.id, notices.userId))
    .where(and(eq(notices.state, 'pending'), eq(notices.channel, notifier.channel)))
    .orderBy(asc(notices.createdAt))
    .limit(options.limit ?? NOTICE_RUN_LIMIT)

  for (const notice of pending) {
    // The account is gone, or its address is the tombstone a deletion leaves.
    if (!notice.email || isUndeliverableAddress(notice.email)) {
      await settle(notice.id, { state: 'failed' })
      report.failed += 1
      continue
    }
    const attempts = notice.attempts + 1
    const [claimed] = await db
      .update(notices)
      .set({ state: 'sending', attempts })
      .where(and(eq(notices.id, notice.id), eq(notices.state, 'pending')))
      .returning({ id: notices.id })
    if (!claimed) continue

    // Once per notice, on its first attempt: a retry of the channel must not
    // ring the phone again. Whatever goes wrong here is not the notice failing.
    if (attempts === 1 && options.push) {
      report.pushed += await options.push(notice.userId).catch(() => 0)
    }

    let result: NotifyResult
    try {
      result = await notifier.notify({ userId: notice.userId, address: notice.email })
    } catch (err) {
      result = { ok: false, retry: true, reason: String(err) }
    }

    if (result.ok) {
      await settle(notice.id, { state: 'sent', sentAt: now })
      report.sent += 1
    } else if (result.retry && attempts < NOTICE_MAX_ATTEMPTS) {
      await settle(notice.id, { state: 'pending' })
      report.retrying += 1
    } else {
      await settle(notice.id, { state: 'failed' })
      report.failed += 1
      await recordOpsEvent(db, {
        kind: 'notice_failed',
        detail: `${notice.userId}: ${result.reason}`,
      })
    }
  }

  return report
}
