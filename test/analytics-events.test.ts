// The event registry is what funnels join on, so every name that is actually
// captured has to be in it.

import { describe, expect, it } from 'vitest'

import {
  ANALYTICS_EVENTS,
  EVENT_NAME_PATTERN,
  isAnalyticsEvent,
} from '../shared/utils/analytics-events'

describe('analytics event registry', () => {
  it('names every event in the shape PostHog and fleet.json accept', () => {
    for (const name of Object.keys(ANALYTICS_EVENTS)) expect(name).toMatch(EVENT_NAME_PATTERN)
  })

  it('does not treat Object.prototype keys as events', () => {
    expect(isAnalyticsEvent('toString')).toBe(false)
    expect(isAnalyticsEvent('constructor')).toBe(false)
  })
})
