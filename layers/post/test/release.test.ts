import { describe, expect, it } from 'vitest'

import { localParts } from '../shared/utils/calendar'
import { ALL_MAIL_DAYS, mailDaysFromWeekdays } from '../shared/utils/mail-days'
import {
  deliverable,
  isDue,
  nextRelease,
  pendingFrom,
  planRelease,
  returnEarliestDate,
  settle,
  type ReleaseState,
} from '../shared/utils/release'

// November 2026: the 16th is a Monday, the 21st a Saturday, the 22nd a
// Sunday. New York is UTC-5, so its 10 am delivery is 15:00 UTC.
const NY = 'America/New_York'
const utc = (iso: string) => new Date(`${iso}Z`)
const SATURDAYS_ONLY = mailDaysFromWeekdays([6])

const everyDayAtTen: ReleaseState = { zone: NY, current: { mailDays: ALL_MAIL_DAYS, hour: 10 } }

describe('next release', () => {
  it("is today's delivery hour when it has not come yet", () => {
    const now = utc('2026-11-16T13:00:00')
    const release = nextRelease(now, everyDayAtTen)
    expect(release).toEqual({ date: '2026-11-16', at: utc('2026-11-16T15:00:00') })
    expect(isDue(release, now)).toBe(false)
  })

  it('moves to the next mail day once today is released', () => {
    const state = { ...everyDayAtTen, lastReleaseDate: '2026-11-16' }
    expect(nextRelease(utc('2026-11-16T16:00:00'), state)).toEqual({
      date: '2026-11-17',
      at: utc('2026-11-17T15:00:00'),
    })
  })

  it('skips Sunday', () => {
    const state = { ...everyDayAtTen, lastReleaseDate: '2026-11-21' }
    expect(nextRelease(utc('2026-11-21T17:00:00'), state).date).toBe('2026-11-23')
  })

  it('waits for the one mail day of a weekly reader', () => {
    const state = { zone: NY, current: { mailDays: SATURDAYS_ONLY, hour: 10 } }
    expect(nextRelease(utc('2026-11-16T13:00:00'), state)).toEqual({
      date: '2026-11-21',
      at: utc('2026-11-21T15:00:00'),
    })
  })
})

describe('catching up after a missed run', () => {
  const missedSaturday = { ...everyDayAtTen, lastReleaseDate: '2026-11-20' }

  it('delivers late while it is still that mail day', () => {
    // 11 pm on Saturday in New York.
    const now = utc('2026-11-22T04:00:00')
    const release = nextRelease(now, missedSaturday)
    expect(release.date).toBe('2026-11-21')
    expect(isDue(release, now)).toBe(true)
  })

  it('waits for Monday once the day has ended, never delivering on Sunday', () => {
    const now = utc('2026-11-22T14:00:00')
    const release = nextRelease(now, missedSaturday)
    expect(release).toEqual({ date: '2026-11-23', at: utc('2026-11-23T15:00:00') })
    expect(isDue(release, now)).toBe(false)
  })
})

describe('setting changes', () => {
  it('take effect tomorrow, local', () => {
    // 11:30 pm on Monday in New York.
    expect(pendingFrom(utc('2026-11-17T04:30:00'), NY)).toBe('2026-11-17')
  })

  it("leave today's release where it was", () => {
    const state: ReleaseState = {
      ...everyDayAtTen,
      pending: { mailDays: SATURDAYS_ONLY, hour: 8, from: '2026-11-17' },
    }
    expect(nextRelease(utc('2026-11-16T13:00:00'), state)).toEqual({
      date: '2026-11-16',
      at: utc('2026-11-16T15:00:00'),
    })
  })

  it('apply from the next mail day', () => {
    const state: ReleaseState = {
      ...everyDayAtTen,
      pending: { mailDays: SATURDAYS_ONLY, hour: 8, from: '2026-11-17' },
      lastReleaseDate: '2026-11-16',
    }
    expect(nextRelease(utc('2026-11-16T16:00:00'), state)).toEqual({
      date: '2026-11-21',
      at: utc('2026-11-21T13:00:00'),
    })
  })

  it('never produce a second release in one day', () => {
    const state: ReleaseState = {
      ...everyDayAtTen,
      pending: { mailDays: ALL_MAIL_DAYS, hour: 20, from: '2026-11-16' },
      lastReleaseDate: '2026-11-16',
    }
    expect(nextRelease(utc('2026-11-16T17:00:00'), state)).toEqual({
      date: '2026-11-17',
      at: utc('2026-11-18T01:00:00'),
    })
  })
})

describe('time zone changes', () => {
  it('apply immediately: a traveller gets mail in the morning where they are', () => {
    const state = { ...everyDayAtTen, zone: 'Asia/Tokyo', lastReleaseDate: '2026-11-16' }
    // Monday evening in New York is already Tuesday 9:30 am in Tokyo.
    expect(nextRelease(utc('2026-11-17T00:30:00'), state)).toEqual({
      date: '2026-11-17',
      at: utc('2026-11-17T01:00:00'),
    })
  })

  it('never repeat a date after travelling back across the date line', () => {
    // Released on Wednesday in Tokyo, then landed in Los Angeles on Tuesday evening.
    const state = { ...everyDayAtTen, zone: 'America/Los_Angeles', lastReleaseDate: '2026-11-18' }
    expect(nextRelease(utc('2026-11-18T03:00:00'), state)).toEqual({
      date: '2026-11-19',
      at: utc('2026-11-19T18:00:00'),
    })
  })

  it("read the promised date on the recipient's calendar", () => {
    const tokyo = { ...everyDayAtTen, zone: 'Asia/Tokyo' }
    const release = nextRelease(utc('2026-11-17T22:00:00'), tokyo)
    expect(release.date).toBe('2026-11-18')
    expect(deliverable('2026-11-18', release.date)).toBe(true)
    // Wednesday morning in Tokyo is still Tuesday evening in New York.
    expect(localParts(release.at, NY).date).toBe('2026-11-17')
  })
})

describe('a pending change', () => {
  const state: ReleaseState = {
    ...everyDayAtTen,
    pending: { mailDays: SATURDAYS_ONLY, hour: 8, from: '2026-11-17' },
  }

  it('stays pending before its date', () => {
    expect(settle(state, '2026-11-16')).toBe(state)
  })

  it('becomes the current settings on its date', () => {
    expect(settle(state, '2026-11-17')).toEqual({
      ...everyDayAtTen,
      current: { mailDays: SATURDAYS_ONLY, hour: 8 },
      pending: null,
    })
  })
})

describe('batching', () => {
  it('gives one notice for three letters from two senders', () => {
    const inTransit = [
      { id: 'from-a-1', earliestDate: '2026-11-18' },
      { id: 'from-a-2', earliestDate: '2026-11-20' },
      { id: 'from-b-1', earliestDate: '2026-11-20' },
      { id: 'from-b-2', earliestDate: '2026-11-21' },
    ]
    expect(planRelease(inTransit, '2026-11-20')).toEqual({
      deliver: ['from-a-1', 'from-a-2', 'from-b-1'],
      notify: true,
    })
  })

  it('gives no notice on an empty day', () => {
    expect(planRelease([{ id: 'later', earliestDate: '2026-11-21' }], '2026-11-20')).toEqual({
      deliver: [],
      notify: false,
    })
  })

  it('has nothing left to deliver or announce when a run is repeated', () => {
    const inTransit = [{ id: 'a', earliestDate: '2026-11-20' }]
    const first = planRelease(inTransit, '2026-11-20')
    const remaining = inTransit.filter((delivery) => !first.deliver.includes(delivery.id))
    expect(planRelease(remaining, '2026-11-20')).toEqual({ deliver: [], notify: false })
  })
})

describe('returned letters', () => {
  it("arrive with the author's next release", () => {
    const beforeToday = utc('2026-11-16T13:00:00')
    const earliest = returnEarliestDate(beforeToday, NY)
    expect(deliverable(earliest, nextRelease(beforeToday, everyDayAtTen).date)).toBe(true)

    const afterToday = utc('2026-11-16T16:00:00')
    const state = { ...everyDayAtTen, lastReleaseDate: '2026-11-16' }
    const next = nextRelease(afterToday, state)
    expect(next.date).toBe('2026-11-17')
    expect(deliverable(returnEarliestDate(afterToday, NY), next.date)).toBe(true)
  })
})
