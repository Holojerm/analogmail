// From sealing to the promised date. A sealed letter waits for the next
// pickup (5 pm sender-local on a postal day); the pickup date is its
// postmark, and both dates below are fixed from that moment on.

import {
  addDays,
  addPostalDays,
  localParts,
  nextPostalDay,
  zonedInstant,
  type LocalDate,
} from './calendar'
import { nextMailDay } from './mail-days'
import { transitDays, type Place } from './transit'

export const PICKUP_HOUR = 17

export interface Pickup {
  at: Date
  postmark: LocalDate
}

/** The first pickup strictly after `sealedAt`. Sealing at 5 pm sharp misses it. */
export function nextPickup(sealedAt: Date, senderZone: string): Pickup {
  let postmark = nextPostalDay(localParts(sealedAt, senderZone).date)
  let at = zonedInstant(postmark, PICKUP_HOUR, senderZone)
  if (at.getTime() <= sealedAt.getTime()) {
    postmark = nextPostalDay(addDays(postmark, 1))
    at = zonedInstant(postmark, PICKUP_HOUR, senderZone)
  }
  return { at, postmark }
}

/** Recall and edits are allowed until the letter is collected, then never. */
export function canRecall(now: Date, pickupAt: Date): boolean {
  return now.getTime() < pickupAt.getTime()
}

/** The first date the letter may arrive: transit alone, no mail days. */
export function earliestDate(postmark: LocalDate, transit: number): LocalDate {
  return addPostalDays(postmark, transit)
}

/**
 * The "arrives Thursday" shown to the sender: the earliest date rolled
 * forward to the recipient's mail days as they stood at the postmark. It is
 * the recipient's calendar day, and it is an estimate, never confirmed.
 */
export function promisedDate(earliest: LocalDate, recipientMailDays: number): LocalDate {
  return nextMailDay(recipientMailDays, earliest)
}

export interface Posting extends Pickup {
  transitDays: number
  earliestDate: LocalDate
  promisedDate: LocalDate
}

export function planPosting(
  sealedAt: Date,
  sender: { zone: string; place: Place },
  recipient: { place: Place; mailDays: number },
): Posting {
  const pickup = nextPickup(sealedAt, sender.zone)
  const transit = transitDays(sender.place, recipient.place)
  const earliest = earliestDate(pickup.postmark, transit)
  return {
    ...pickup,
    transitDays: transit,
    earliestDate: earliest,
    promisedDate: promisedDate(earliest, recipient.mailDays),
  }
}

export type SenderView =
  | { kind: 'awaiting_pickup'; pickupAt: Date; arrives: LocalDate }
  | { kind: 'in_transit'; arrives: LocalDate }
  | { kind: 'posted'; postmark: LocalDate }

/**
 * Everything a sender may ever learn about a sealed letter. Built only from
 * what was fixed at the postmark and the sender's own clock, so it cannot
 * leak whether, or at what hour, the letter was delivered or opened.
 */
export function senderView(
  now: Date,
  senderZone: string,
  letter: { pickupAt: Date; postmark: LocalDate; promisedDate: LocalDate },
): SenderView {
  if (canRecall(now, letter.pickupAt)) {
    return { kind: 'awaiting_pickup', pickupAt: letter.pickupAt, arrives: letter.promisedDate }
  }
  if (localParts(now, senderZone).date <= letter.promisedDate) {
    return { kind: 'in_transit', arrives: letter.promisedDate }
  }
  return { kind: 'posted', postmark: letter.postmark }
}
