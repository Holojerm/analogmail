// A notice that hard-bounced. The person could not be told their mail had
// arrived, so the letters that came with that release go back to their
// senders, as undeliverable post does. A letter already opened stays.
//
// The webhook names an address and when the email was created, not a notice,
// so the notice is the one sent to that person nearest that time.

import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { recordOpsEvent } from '#server/utils/ops'
import { normalizeEmail } from '#server/utils/users'

import type { PostDb } from '../utils/release-run'
import { returnToSender } from '../utils/returns'

// A queued email is created at Resend when the consumer posts it, which
// retries can push well past the moment the notice was marked sent.
const MATCH_WINDOW_MS = 6 * 60 * 60 * 1000

export interface ResendEmailEvent {
  type: string
  data: {
    to: string[]
    subject?: string
    created_at?: string
    bounce?: { type?: string }
  }
}

/** Suppressed (a known-dead address, never sent) or a permanent bounce. */
export function isHardBounce(event: ResendEmailEvent): boolean {
  if (event.type === 'email.suppressed') return true
  return event.type === 'email.bounced' && event.data.bounce?.type === 'Permanent'
}

export interface BounceResult {
  outcome: 'ignored' | 'duplicate' | 'bounced'
  returned: number
}

export async function handleNoticeBounce(
  db: PostDb,
  bounce: { address: string; emailCreatedAt: Date | null },
  now: Date,
): Promise<BounceResult> {
  const { users, notices, deliveries, letters } = tables
  const nothing: BounceResult = { outcome: 'ignored', returned: 0 }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizeEmail(bounce.address)))
  if (!user) return nothing

  const around = (bounce.emailCreatedAt ?? now).getTime()
  const candidates = await db
    .select()
    .from(notices)
    .where(
      and(
        eq(notices.userId, user.id),
        eq(notices.channel, 'email'),
        inArray(notices.state, ['sent', 'bounced']),
      ),
    )
    .orderBy(desc(notices.sentAt))
    .limit(10)
  const distance = (sentAt: Date | null) => Math.abs((sentAt?.getTime() ?? Infinity) - around)
  const [notice] = candidates
    .filter((row) => distance(row.sentAt) <= MATCH_WINDOW_MS)
    .sort((a, b) => distance(a.sentAt) - distance(b.sentAt))
  if (!notice) return nothing
  if (notice.state === 'bounced') return { outcome: 'duplicate', returned: 0 }

  // Returns first, the mark last: if this stops halfway the event is
  // delivered again and finishes the job, because each return is repeatable.
  const unseen = await db
    .select({ id: deliveries.id, authorId: letters.authorId })
    .from(deliveries)
    .leftJoin(letters, eq(letters.id, deliveries.letterId))
    .where(
      and(
        eq(deliveries.recipientId, user.id),
        eq(deliveries.kind, 'letter'),
        eq(deliveries.state, 'delivered'),
        eq(deliveries.mailDate, notice.mailDate),
        isNull(deliveries.openedAt),
      ),
    )
  let returned = 0
  for (const delivery of unseen) {
    if (await returnToSender(db, delivery.id, delivery.authorId, now, { fromMantel: true })) {
      returned += 1
    }
  }

  await db.update(notices).set({ state: 'bounced' }).where(eq(notices.id, notice.id))
  await recordOpsEvent(db, {
    kind: 'notice_bounced',
    detail: `${user.id} ${notice.mailDate}: ${returned} returned to sender`,
  })
  return { outcome: 'bounced', returned }
}
