// The gazette and the almanac: a family room's past month, and its past
// year, laid out to read. An issue is named by its period ('2026-10' or
// '2026') and comes out when that period is over, by the calendar in UTC,
// since a family has no one time zone.

import type { RoomFamily, RoomPhoto } from './room-types'

export type RoomIssueKind = 'gazette' | 'almanac'

export interface RoomIssuePeriod {
  id: string
  kind: RoomIssueKind
  /** First instant of the period, and of the one after it. */
  from: Date
  to: Date
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** The period an issue covers, or null when the name is not one. */
export function roomIssuePeriod(id: string): RoomIssuePeriod | null {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(id)
  if (!match) return null
  const year = Number(match[1])
  if (!match[2]) {
    return {
      id,
      kind: 'almanac',
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year + 1, 0, 1)),
    }
  }
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return {
    id,
    kind: 'gazette',
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  }
}

/** An issue is out once its period has ended. This month's is not written yet. */
export const roomIssueIsOut = (period: RoomIssuePeriod, now: Date) => now >= period.to

/** "October 2026" for a gazette, "2026" for an almanac. */
export function roomIssueLabel(id: string): string {
  const [year, month] = id.split('-')
  return month ? `${MONTHS[Number(month) - 1]} ${year}` : String(year)
}

/** 'YYYY-MM' of an instant, in UTC. */
export const roomMonthOf = (at: Date) => at.toISOString().slice(0, 7)

/** One listed issue: enough to name it and say what is in it. */
export interface RoomIssueSummary {
  id: string
  photos: number
  /** How many times someone said where they were. */
  checkins: number
}

export interface RoomIssueList {
  family: RoomFamily
  /** Newest first. */
  gazettes: RoomIssueSummary[]
  almanacs: RoomIssueSummary[]
}

/** A month of photos within an issue. A gazette has one; an almanac up to twelve. */
export interface RoomIssueMonth {
  id: string
  /** Every photo added that month, of which `photos` shows the first few. */
  total: number
  photos: RoomPhoto[]
}

export interface RoomIssueStop {
  city: string
  country: string
  at: string
}

export interface RoomIssue {
  family: RoomFamily
  id: string
  kind: RoomIssueKind
  months: RoomIssueMonth[]
  /** Each person who said where they were in the period, and each place in order. */
  places: { userId: string; name: string; stops: RoomIssueStop[] }[]
}

/** Photos shown per month: all of a gazette's month within reason, a page's worth in an almanac. */
export const ROOM_GAZETTE_PHOTOS = 120
export const ROOM_ALMANAC_PHOTOS_A_MONTH = 12
