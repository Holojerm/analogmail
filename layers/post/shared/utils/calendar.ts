// Calendar days and wall-clock time in a named zone. Intl is the only
// time-zone database present in workerd, bun and browsers alike, so this
// uses it directly and adds no dependency.
//
// A LocalDate is a calendar day ('2026-11-16'), never an instant. It has no
// zone of its own, and it compares and sorts as a string.

export type LocalDate = string

export interface LocalParts {
  date: LocalDate
  hour: number
  minute: number
}

const DAY_MS = 86_400_000

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(zone, formatter)
  }
  return formatter
}

/** The zone's wall-clock reading at `instantMs`, expressed as if it were UTC. */
function wallClockMs(instantMs: number, zone: string): number {
  const parts: Record<string, number> = {}
  for (const part of formatterFor(zone).formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  const { year, month, day, hour, minute, second } = parts as Record<string, number>
  return Date.UTC(year!, month! - 1, day!, hour, minute, second)
}

export function isValidZone(zone: string): boolean {
  try {
    formatterFor(zone)
    return true
  } catch {
    return false
  }
}

export function toLocalDate(year: number, month: number, day: number): LocalDate {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

function utcMsOf(date: LocalDate): number {
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(ms)) throw new Error(`Not a calendar date: ${date}`)
  return ms
}

/** What the wall clock in `zone` reads at `instant`. */
export function localParts(instant: Date, zone: string): LocalParts {
  const wall = new Date(wallClockMs(instant.getTime(), zone))
  return {
    date: wall.toISOString().slice(0, 10),
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
  }
}

/** 0 is Sunday, 6 is Saturday. */
export function weekdayOf(date: LocalDate): number {
  return new Date(utcMsOf(date)).getUTCDay()
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return new Date(utcMsOf(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The instant at which the wall clock in `zone` reads `hour`:00 on `date`.
 *
 * Daylight saving makes some wall times happen twice and others never. A
 * repeated hour resolves to its first occurrence. A skipped hour rolls
 * forward by the size of the gap, so 02:00 on a spring-forward day becomes
 * 03:00, never an hour earlier than asked.
 */
export function zonedInstant(date: LocalDate, hour: number, zone: string): Date {
  const wall = utcMsOf(date) + hour * 3_600_000
  // The offsets a day either side bracket any transition near this wall time.
  const offsetBefore = wallClockMs(wall - DAY_MS, zone) - (wall - DAY_MS)
  const offsetAfter = wallClockMs(wall + DAY_MS, zone) - (wall + DAY_MS)
  const candidates = [wall - offsetBefore, wall - offsetAfter]
  const valid = candidates.filter((ms) => wallClockMs(ms, zone) === wall)
  return new Date(valid.length > 0 ? Math.min(...valid) : candidates[0]!)
}

/** Monday to Saturday. Sunday is never a postal day, for anyone. */
export function isPostalDay(date: LocalDate): boolean {
  return weekdayOf(date) !== 0
}

/** `date` itself when it is a postal day, otherwise the Monday after. */
export function nextPostalDay(date: LocalDate): LocalDate {
  return isPostalDay(date) ? date : addDays(date, 1)
}

/** Counts forward `count` postal days, skipping Sundays. */
export function addPostalDays(date: LocalDate, count: number): LocalDate {
  let current = date
  let remaining = count
  while (remaining > 0) {
    current = addDays(current, 1)
    if (isPostalDay(current)) remaining -= 1
  }
  return current
}
