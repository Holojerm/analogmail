// When a person's mailbox next takes delivery. One release per person per
// local day, on their mail days, at their delivery hour, by their wall clock.

import { addDays, localParts, zonedInstant, type LocalDate } from './calendar'
import { isMailDay } from './mail-days'

export interface MailSettings {
  mailDays: number
  hour: number
}

export interface ReleaseState {
  /** Applies immediately when it changes, so a traveller gets morning mail. */
  zone: string
  current: MailSettings
  /** A change to mail days or hour, waiting for `from` to take effect. */
  pending?: (MailSettings & { from: LocalDate }) | null
  /** The local date of the last release. No date is ever released twice. */
  lastReleaseDate?: LocalDate | null
}

export interface Release {
  date: LocalDate
  at: Date
}

/**
 * The date a settings change made at `now` takes effect: tomorrow, local.
 * Today's release stays where it was whether or not it has happened, so
 * nobody can move their delivery hour to "now" to check the mailbox early.
 */
export function pendingFrom(now: Date, zone: string): LocalDate {
  return addDays(localParts(now, zone).date, 1)
}

export function settingsOn(date: LocalDate, state: ReleaseState): MailSettings {
  return state.pending && date >= state.pending.from ? state.pending : state.current
}

/** Folds a pending change into `current` once its date has come. */
export function settle(state: ReleaseState, today: LocalDate): ReleaseState {
  if (!state.pending || today < state.pending.from) return state
  const { mailDays, hour } = state.pending
  return { ...state, current: { mailDays, hour }, pending: null }
}

/**
 * The next release for this person: the first mail day from today on that
 * has not been released yet.
 *
 * Only today and later are candidates. A release that was missed and whose
 * day has ended is therefore never run late: the mail waits for the next
 * mail day, so an outage on Saturday cannot produce a Sunday delivery. A
 * release missed earlier today is returned with `at` in the past, which is
 * how a late run catches up within the same day.
 */
export function nextRelease(now: Date, state: ReleaseState): Release {
  const today = localParts(now, state.zone).date
  // A week covers any mail-day mask; the second covers a pending change.
  for (let offset = 0; offset <= 14; offset += 1) {
    const date = addDays(today, offset)
    if (state.lastReleaseDate && date <= state.lastReleaseDate) continue
    const settings = settingsOn(date, state)
    if (!isMailDay(settings.mailDays, date)) continue
    return { date, at: zonedInstant(date, settings.hour, state.zone) }
  }
  throw new Error('No mail day within two weeks: the mail-day mask is empty')
}

export function isDue(release: Release, now: Date): boolean {
  return release.at.getTime() <= now.getTime()
}

/** A letter is delivered by the first release on or after its earliest date. */
export function deliverable(earliestDate: LocalDate, releaseDate: LocalDate): boolean {
  return earliestDate <= releaseDate
}

/**
 * A returned letter goes back through the post: it is deliverable to its
 * author from today, so it arrives with their next release.
 */
export function returnEarliestDate(now: Date, authorZone: string): LocalDate {
  return localParts(now, authorZone).date
}

export interface ReleasePlan {
  deliver: string[]
  /** One notice however many letters arrive; none on an empty day. */
  notify: boolean
}

export function planRelease(
  inTransit: { id: string; earliestDate: LocalDate }[],
  releaseDate: LocalDate,
): ReleasePlan {
  const deliver = inTransit
    .filter((delivery) => deliverable(delivery.earliestDate, releaseDate))
    .map((delivery) => delivery.id)
  return { deliver, notify: deliver.length > 0 }
}
