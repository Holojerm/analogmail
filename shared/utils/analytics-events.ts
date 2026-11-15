// Every analytics event this app records, in one list.
//
// ── Why a registry ──────────────────────────────────────────────────────────
// Event names are the join keys of every funnel. A typo'd name produces no
// error at all: PostHog accepts `user_activted` as a brand-new event and the
// funnel that counts `user_activated` quietly flatlines. `captureServerEvent`
// takes an `AnalyticsEvent` rather than a string so the compiler catches that,
// and fleet.json's `product` block may only name events from here
// (scripts/check-fleet.ts), so the dashboard never charts an event nobody fires.
//
// ── Why two files ───────────────────────────────────────────────────────────
// This file is the template's and arrives with every sync. A fork's own events
// live in `app-events.ts`, which the template ships empty and never touches
// again, so syncing never conflicts with a product's taxonomy.
//
// ── Renaming ────────────────────────────────────────────────────────────────
// Don't. PostHog history is keyed on the string; a rename splits every chart
// at the day it shipped. Add a new name and retire the old one instead.

import { APP_EVENTS } from './app-events'

/** Where an event is captured. Client events can be dropped by ad blockers. */
export type EventOrigin = 'server' | 'client'

export interface EventDefinition {
  origin: EventOrigin
  /** What happened, in one line — the growth routine reads these. */
  description: string
}

export const TEMPLATE_EVENTS = {
  $pageview: { origin: 'client', description: 'A page was viewed (SPA navigations included).' },
  $exception: { origin: 'server', description: 'An unhandled server error.' },

  user_signed_up: {
    origin: 'server',
    description: 'An account was created. Carries signup_source/medium/campaign.',
  },
  user_signed_in: { origin: 'server', description: 'An existing account signed in.' },
  user_signed_out: { origin: 'server', description: 'A user signed out.' },
  user_activated: {
    origin: 'server',
    description: 'The user finished onboarding — the template’s activation moment.',
  },

  feedback_submitted: {
    origin: 'server',
    description: 'In-app feedback arrived.',
  },
  feedback_replied: { origin: 'server', description: 'The owner replied to a feedback item.' },

  lifecycle_email_sent: {
    origin: 'server',
    description: 'A lifecycle email went out. `step` names which (e.g. activation_nudge).',
  },
} as const satisfies Record<string, EventDefinition>

export const ANALYTICS_EVENTS = { ...TEMPLATE_EVENTS, ...APP_EVENTS } as const

export type AnalyticsEvent = keyof typeof ANALYTICS_EVENTS

/** PostHog's own `$`-prefixed names, or snake_case. */
export const EVENT_NAME_PATTERN = /^\$?[a-z][a-z0-9_]*$/

export function isAnalyticsEvent(name: string): name is AnalyticsEvent {
  return Object.hasOwn(ANALYTICS_EVENTS, name)
}
