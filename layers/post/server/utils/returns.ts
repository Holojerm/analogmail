// Returned to sender. A letter that cannot be delivered (the recipient closed
// the correspondence, or their address hard-bounced) goes back through the
// post and arrives with its author's next release, like any other mail.

import { and, eq, isNull, or } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { nextMailDay } from '../../shared/utils/mail-days'
import { returnEarliestDate, settingsOn } from '../../shared/utils/release'

import { releaseStateOf, type PostDb } from './release-run'

/**
 * Turns an undelivered letter around. False when there was nothing to
 * return: the delivery is unknown, already delivered, or is itself a return.
 *
 * A letter is never both delivered and returned: the claim below only takes
 * a delivery that is still in transit. Safe to call again if the second
 * write failed.
 *
 * `authorId` is null once the author has deleted their account; the letter
 * is then withheld from the recipient and goes nowhere.
 *
 * `fromMantel` also takes a letter that was delivered but never opened. It
 * is for a bounced notice only: the letter reached a mantel nobody was told
 * about. An opened letter is never taken back.
 */
export async function returnToSender(
  db: PostDb,
  deliveryId: string,
  authorId: string | null,
  now: Date,
  options: { fromMantel?: boolean } = {},
): Promise<boolean> {
  const { deliveries, postalProfiles } = tables
  const isLetter = and(eq(deliveries.id, deliveryId), eq(deliveries.kind, 'letter'))
  const inTransit = eq(deliveries.state, 'in_transit')
  const unopened = and(eq(deliveries.state, 'delivered'), isNull(deliveries.openedAt))

  const [claimed] = await db
    .update(deliveries)
    .set({ state: 'returned' })
    .where(and(isLetter, options.fromMantel ? or(inTransit, unopened) : inTransit))
    .returning({ letterId: deliveries.letterId })
  const [returned] = claimed
    ? [claimed]
    : await db
        .select({ letterId: deliveries.letterId })
        .from(deliveries)
        .where(and(isLetter, eq(deliveries.state, 'returned')))
  if (!returned) return false
  if (!authorId) return true

  const [author] = await db.select().from(postalProfiles).where(eq(postalProfiles.userId, authorId))
  if (!author) return true

  const earliestDate = returnEarliestDate(now, author.timeZone)
  const { mailDays } = settingsOn(earliestDate, releaseStateOf(author))
  await db
    .insert(deliveries)
    .values({
      letterId: returned.letterId,
      recipientId: authorId,
      kind: 'return',
      earliestDate,
      promisedDate: nextMailDay(mailDays, earliestDate),
      transitDays: 0,
    })
    .onConflictDoNothing()
  return true
}
