// A person's mail days: any subset of Monday to Saturday, at least one,
// stored as a 6-bit mask (Monday is bit 0, Saturday bit 5). Sunday has no
// bit, so no setting can ever select it.

import { addDays, weekdayOf, type LocalDate } from './calendar'

export const ALL_MAIL_DAYS = 0b111111

/** `weekday` as `weekdayOf` returns it: 0 Sunday to 6 Saturday. */
function bitFor(weekday: number): number {
  return weekday === 0 ? 0 : 1 << (weekday - 1)
}

export function isValidMailDays(mask: number): boolean {
  return Number.isInteger(mask) && mask >= 1 && mask <= ALL_MAIL_DAYS
}

export function mailDaysFromWeekdays(weekdays: number[]): number {
  return weekdays.reduce((mask, weekday) => mask | bitFor(weekday), 0)
}

/** The weekdays (1 = Monday … 6 = Saturday) a mask delivers on. */
export function weekdaysFromMailDays(mask: number): number[] {
  return [1, 2, 3, 4, 5, 6].filter((weekday) => (mask & (1 << (weekday - 1))) !== 0)
}

export function isMailDay(mask: number, date: LocalDate): boolean {
  return (mask & bitFor(weekdayOf(date))) !== 0
}

/** The first mail day on or after `from`. */
export function nextMailDay(mask: number, from: LocalDate): LocalDate {
  if (!isValidMailDays(mask)) throw new Error(`Not a mail-day mask: ${mask}`)
  let date = from
  while (!isMailDay(mask, date)) date = addDays(date, 1)
  return date
}
