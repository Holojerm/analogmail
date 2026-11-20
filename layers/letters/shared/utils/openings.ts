// How letters to a kept mantel may open, as its keepers set it and as a
// writer chooses from it.

import { z } from 'zod'

export const OPENING_DAYS_MAX = 12
export const OPENING_LABEL_MAX = 40

export interface OpeningDay {
  /** 'YYYY-MM-DD' on the mantel's calendar. */
  on: string
  /** What the day is, such as "18th birthday". May be empty. */
  label: string
}

export interface Openings {
  /** A letter may open as soon as it arrives. */
  onArrival: boolean
  /** Days a letter may be sealed until, earliest first. */
  days: OpeningDay[]
}

export const NO_OPENINGS: Openings = { onArrival: true, days: [] }

export const openingsSchema = z.object({
  onArrival: z.boolean(),
  days: z
    .array(
      z.object({
        on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        label: z.string().trim().max(OPENING_LABEL_MAX),
      }),
    )
    .max(OPENING_DAYS_MAX),
})

/** What the keepers see of the setting: it and who last changed it. */
export interface OpeningsView extends Openings {
  changedBy: string | null
  changedAt: string | null
}
