import { describe, expect, it } from 'vitest'

import {
  addDays,
  addPostalDays,
  isPostalDay,
  localParts,
  weekdayOf,
  zonedInstant,
} from '../shared/utils/calendar'
import {
  ALL_MAIL_DAYS,
  isMailDay,
  isValidMailDays,
  mailDaysFromWeekdays,
  nextMailDay,
} from '../shared/utils/mail-days'
import {
  canRecall,
  earliestDate,
  nextPickup,
  planPosting,
  promisedDate,
  senderView,
} from '../shared/utils/postmark'
import { distanceKm, transitDays, transitDaysForDistance } from '../shared/utils/transit'

// November 2026: the 15th is a Sunday, the 16th a Monday. US clocks went
// back on the 1st, so New York is UTC-5 and Los Angeles UTC-8 all month.
const NY = 'America/New_York'
const utc = (iso: string) => new Date(`${iso}Z`)
const SATURDAYS_ONLY = mailDaysFromWeekdays([6])

const newYork = { lat: 40.7128, lng: -74.006, country: 'US' }
const chicago = { lat: 41.8781, lng: -87.6298, country: 'US' }
const tokyo = { lat: 35.6762, lng: 139.6503, country: 'JP' }

describe('calendar', () => {
  it('knows the weekday of a calendar date', () => {
    expect(weekdayOf('2026-11-15')).toBe(0)
    expect(weekdayOf('2026-11-21')).toBe(6)
    expect(isPostalDay('2026-11-15')).toBe(false)
    expect(isPostalDay('2026-11-16')).toBe(true)
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('counts postal days, skipping Sunday', () => {
    expect(addPostalDays('2026-11-16', 4)).toBe('2026-11-20')
    expect(addPostalDays('2026-11-19', 3)).toBe('2026-11-23')
    expect(addPostalDays('2026-11-21', 2)).toBe('2026-11-24')
  })

  it('reads the wall clock in a zone', () => {
    expect(localParts(utc('2026-11-17T22:00:00'), 'Asia/Tokyo')).toEqual({
      date: '2026-11-18',
      hour: 7,
      minute: 0,
    })
  })

  it('handles half-hour and 45-minute offsets', () => {
    expect(zonedInstant('2026-11-16', 10, 'Asia/Kolkata')).toEqual(utc('2026-11-16T04:30:00'))
    expect(zonedInstant('2026-11-16', 10, 'Asia/Kathmandu')).toEqual(utc('2026-11-16T04:15:00'))
  })

  it('keeps 10 am at 10 am across the spring change', () => {
    expect(zonedInstant('2027-03-13', 10, NY)).toEqual(utc('2027-03-13T15:00:00'))
    expect(zonedInstant('2027-03-15', 10, NY)).toEqual(utc('2027-03-15T14:00:00'))
  })

  it('rolls a skipped hour forward, never back', () => {
    // 02:00 does not exist on 14 March 2027 in New York; 03:00 EDT is 07:00 UTC.
    expect(zonedInstant('2027-03-14', 2, NY)).toEqual(utc('2027-03-14T07:00:00'))
  })

  it('keeps 10 am at 10 am across the autumn change, and takes a repeated hour once', () => {
    expect(zonedInstant('2027-11-06', 10, NY)).toEqual(utc('2027-11-06T14:00:00'))
    expect(zonedInstant('2027-11-08', 10, NY)).toEqual(utc('2027-11-08T15:00:00'))
    expect(zonedInstant('2027-11-07', 1, NY)).toEqual(utc('2027-11-07T05:00:00'))
  })
})

describe('mail days', () => {
  it('never includes Sunday', () => {
    expect(mailDaysFromWeekdays([0])).toBe(0)
    expect(isMailDay(ALL_MAIL_DAYS, '2026-11-15')).toBe(false)
    expect(isValidMailDays(0)).toBe(false)
    expect(isValidMailDays(64)).toBe(false)
    expect(isValidMailDays(SATURDAYS_ONLY)).toBe(true)
  })

  it('finds the next mail day on or after a date', () => {
    expect(nextMailDay(ALL_MAIL_DAYS, '2026-11-15')).toBe('2026-11-16')
    expect(nextMailDay(ALL_MAIL_DAYS, '2026-11-20')).toBe('2026-11-20')
    expect(nextMailDay(SATURDAYS_ONLY, '2026-11-23')).toBe('2026-11-28')
    expect(() => nextMailDay(0, '2026-11-16')).toThrow()
  })
})

describe('pickup', () => {
  it('collects a letter sealed before 5 pm the same day', () => {
    expect(nextPickup(utc('2026-11-16T20:00:00'), NY)).toEqual({
      at: utc('2026-11-16T22:00:00'),
      postmark: '2026-11-16',
    })
  })

  it('holds a letter sealed after 5 pm, or at 5 pm sharp, for the next day', () => {
    const tuesday = { at: utc('2026-11-17T22:00:00'), postmark: '2026-11-17' }
    expect(nextPickup(utc('2026-11-16T23:00:00'), NY)).toEqual(tuesday)
    expect(nextPickup(utc('2026-11-16T22:00:00'), NY)).toEqual(tuesday)
  })

  it('rolls Saturday evening and Sunday to Monday', () => {
    const monday = { at: utc('2026-11-23T22:00:00'), postmark: '2026-11-23' }
    expect(nextPickup(utc('2026-11-21T23:00:00'), NY)).toEqual(monday)
    expect(nextPickup(utc('2026-11-22T15:00:00'), NY)).toEqual(monday)
  })

  it("uses the sender's zone, not the server's", () => {
    const sealedAt = utc('2026-11-16T22:30:00')
    expect(nextPickup(sealedAt, 'Asia/Tokyo')).toEqual({
      at: utc('2026-11-17T08:00:00'),
      postmark: '2026-11-17',
    })
    expect(nextPickup(sealedAt, 'America/Los_Angeles')).toEqual({
      at: utc('2026-11-17T01:00:00'),
      postmark: '2026-11-16',
    })
  })

  it('allows recall before pickup and refuses it from pickup on', () => {
    const pickupAt = utc('2026-11-16T22:00:00')
    expect(canRecall(utc('2026-11-16T21:59:59'), pickupAt)).toBe(true)
    expect(canRecall(pickupAt, pickupAt)).toBe(false)
    expect(canRecall(utc('2026-11-17T00:00:00'), pickupAt)).toBe(false)
  })
})

describe('transit', () => {
  it('applies each band at its boundary', () => {
    expect(transitDaysForDistance(99.9, true)).toBe(2)
    expect(transitDaysForDistance(100, true)).toBe(3)
    expect(transitDaysForDistance(1000, true)).toBe(3)
    expect(transitDaysForDistance(1000.1, true)).toBe(4)
    expect(transitDaysForDistance(50, false)).toBe(2)
    expect(transitDaysForDistance(100, false)).toBe(5)
    expect(transitDaysForDistance(2499.9, false)).toBe(5)
    expect(transitDaysForDistance(2500, false)).toBe(7)
    expect(transitDaysForDistance(8000, false)).toBe(7)
    expect(transitDaysForDistance(8000.1, false)).toBe(9)
  })

  it('measures real cities', () => {
    expect(distanceKm(newYork, chicago)).toBeGreaterThan(1100)
    expect(distanceKm(newYork, chicago)).toBeLessThan(1200)
    expect(transitDays(newYork, { lat: 40.7357, lng: -74.1724, country: 'US' })).toBe(2)
    expect(transitDays(newYork, { lat: 39.9526, lng: -75.1652, country: 'US' })).toBe(3)
    expect(transitDays(newYork, chicago)).toBe(4)
    expect(transitDays(newYork, { lat: 43.6532, lng: -79.3832, country: 'CA' })).toBe(5)
    expect(transitDays(newYork, { lat: 51.5074, lng: -0.1278, country: 'GB' })).toBe(7)
    expect(transitDays(newYork, tokyo)).toBe(9)
    expect(transitDays(tokyo, newYork)).toBe(9)
  })
})

describe('arrival dates', () => {
  it('matches the plan: New York to Chicago, sealed Monday 3 pm, arrives Friday', () => {
    const posting = planPosting(
      utc('2026-11-16T20:00:00'),
      { zone: NY, place: newYork },
      { place: chicago, mailDays: ALL_MAIL_DAYS },
    )
    expect(posting).toEqual({
      at: utc('2026-11-16T22:00:00'),
      postmark: '2026-11-16',
      transitDays: 4,
      earliestDate: '2026-11-20',
      promisedDate: '2026-11-20',
    })
  })

  it('arrives a day later when sealed after pickup', () => {
    const posting = planPosting(
      utc('2026-11-16T23:00:00'),
      { zone: NY, place: newYork },
      { place: chicago, mailDays: ALL_MAIL_DAYS },
    )
    expect(posting.postmark).toBe('2026-11-17')
    expect(posting.promisedDate).toBe('2026-11-21')
  })

  it('skips Sunday in the count', () => {
    expect(earliestDate('2026-11-18', 4)).toBe('2026-11-23')
  })

  it('rolls the promise forward for a one-day-a-week reader', () => {
    expect(promisedDate('2026-11-20', SATURDAYS_ONLY)).toBe('2026-11-21')
    expect(promisedDate('2026-11-23', SATURDAYS_ONLY)).toBe('2026-11-28')
  })
})

describe('what the sender sees', () => {
  const letter = {
    pickupAt: utc('2026-11-16T22:00:00'),
    postmark: '2026-11-16',
    promisedDate: '2026-11-20',
  }

  it('shows the pickup while the letter can still be recalled', () => {
    expect(senderView(utc('2026-11-16T21:00:00'), NY, letter)).toEqual({
      kind: 'awaiting_pickup',
      pickupAt: letter.pickupAt,
      arrives: '2026-11-20',
    })
  })

  it('shows "in transit" through the end of the promised day', () => {
    const inTransit = { kind: 'in_transit', arrives: '2026-11-20' }
    expect(senderView(utc('2026-11-16T22:00:00'), NY, letter)).toEqual(inTransit)
    expect(senderView(utc('2026-11-21T04:00:00'), NY, letter)).toEqual(inTransit)
  })

  it('shows only the postmark afterwards, with nothing about arrival', () => {
    expect(senderView(utc('2026-11-21T05:00:00'), NY, letter)).toEqual({
      kind: 'posted',
      postmark: '2026-11-16',
    })
  })
})
