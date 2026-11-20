// How letters to a kept mantel may open. Its keepers decide: on arrival,
// sealed until one of the days they list, or both, in which case the writer
// chooses. A writer cannot make up a day of their own. Any one keeper may
// change it, because it applies only to letters sealed afterwards: a letter
// already sealed keeps its day.

import { eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { isKeeper } from '#layers/keys/server/utils/mantels'

import { NO_OPENINGS, type Openings, type OpeningsView } from '../../shared/utils/openings'
import { mantelToday } from './kept-mantel'
import { displayNames } from './mantel'
import type { LettersDb } from './people'

/** How far ahead a letter may be sealed. A child born today is not yet this old. */
export const OPENS_ON_MAX_YEARS = 100

const yearsAfter = (day: string, years: number) =>
  `${Number(day.slice(0, 4)) + years}${day.slice(4)}`

export async function mantelOpenings(db: LettersDb, mantelId: string): Promise<Openings> {
  const { mantelOpenings: openings } = tables
  const [row] = await db
    .select({ onArrival: openings.onArrival, days: openings.days })
    .from(openings)
    .where(eq(openings.mantelId, mantelId))
    .limit(1)
  return row ?? NO_OPENINGS
}

/** The setting as its keepers see it. Null for anyone who does not keep the mantel. */
export async function openingsView(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
): Promise<OpeningsView | null> {
  const { mantelOpenings: openings } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const [row] = await db.select().from(openings).where(eq(openings.mantelId, mantelId)).limit(1)
  if (!row) return { ...NO_OPENINGS, changedBy: null, changedAt: null }
  const names = await displayNames(db, row.changedBy ? [row.changedBy] : [])
  return {
    onArrival: row.onArrival,
    days: row.days,
    changedBy: names.get(row.changedBy ?? '') ?? null,
    changedAt: row.updatedAt.toISOString(),
  }
}

/** What a writer may choose from, for a letter postmarked on this day. */
export const choicesFor = (openings: Openings, postmark: string): Openings => ({
  onArrival: openings.onArrival,
  days: openings.days.filter((day) => day.on > postmark),
})

/** Whether a letter postmarked on this day may open as asked. Null opens on arrival. */
export function allowsOpening(openings: Openings, opensOn: string | null, postmark: string) {
  const choices = choicesFor(openings, postmark)
  if (!opensOn) return choices.onArrival
  return choices.days.some((day) => day.on === opensOn)
}

export type SetOpeningsResult = 'changed' | 'not-keeper' | 'no-choice' | 'bad-day'

/**
 * Any keeper sets how letters to the mantel may open. At least one way must
 * be left, and every day must be after today on the mantel's calendar.
 */
export async function setMantelOpenings(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  input: Openings,
  now: Date,
): Promise<SetOpeningsResult> {
  const { mantelOpenings: openings } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return 'not-keeper'
  const today = await mantelToday(db, mantelId, now)
  const latest = yearsAfter(today, OPENS_ON_MAX_YEARS)
  const days = [...new Map(input.days.map((day) => [day.on, day])).values()].toSorted((a, b) =>
    a.on.localeCompare(b.on),
  )
  if (days.some((day) => day.on <= today || day.on > latest)) return 'bad-day'
  if (!input.onArrival && days.length === 0) return 'no-choice'
  const values = { onArrival: input.onArrival, days, changedBy: keeperId, updatedAt: now }
  await db
    .insert(openings)
    .values({ mantelId, ...values, createdAt: now })
    .onConflictDoUpdate({ target: openings.mantelId, set: values })
  return 'changed'
}
