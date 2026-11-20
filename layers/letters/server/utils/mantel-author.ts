// A child's mantel writing back. One of its keepers writes as the mantel, so
// the letter's author is the mantel's id: the post collects it on the
// mantel's calendar, carries it from the mantel's city, and the author's copy
// of its key is wrapped to the mantel's key, where every keeper can open it
// and a re-key moves it. The mantel writes only in correspondences it already
// has: to the people its keepers invited, and to the keepers themselves.

import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { isKeeper } from '#layers/keys/server/utils/mantels'

import type { DeskLetter } from '../../shared/utils/letter-doc'
import { correspondenceLabels } from './correspondences'
import type { LettersDb } from './people'
import { listDesk } from './posting'

/**
 * Who a letter is written by: the person signed in, or, when they name a
 * child's mantel they keep, that mantel. Null when they may not write as it.
 */
export async function writingAs(
  db: LettersDb,
  userId: string,
  mantelId?: string | null,
): Promise<string | null> {
  if (!mantelId) return userId
  const { mantels } = tables
  const [mantel] = await db
    .select({ kind: mantels.kind, closedAt: mantels.closedAt })
    .from(mantels)
    .where(eq(mantels.id, mantelId))
    .limit(1)
  if (mantel?.kind !== 'child' || mantel.closedAt) return null
  return (await isKeeper(db, userId, mantelId)) ? mantelId : null
}

export interface MantelOutbox {
  /** The people the mantel can write to, one open correspondence each. */
  people: { correspondenceId: string; name: string }[]
  /** The mantel's drafts and what it has sealed, as any sender sees them. */
  zone: string
  letters: DeskLetter[]
}

/** What a keeper sees of the letters a child's mantel writes. Null for anyone else. */
export async function mantelOutbox(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  now: Date,
): Promise<MantelOutbox | null> {
  if ((await writingAs(db, keeperId, mantelId)) !== mantelId) return null
  const { correspondences, correspondenceMembers: members } = tables
  const desk = await listDesk(db, mantelId, now)
  // The mantel is a member of each writer's correspondence and of its write
  // link's (which has nobody else in it), never of its news.
  const open = await db
    .select({ id: correspondences.id })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .where(
      and(
        eq(members.userId, mantelId),
        eq(correspondences.mantelId, mantelId),
        isNull(members.leftAt),
        isNull(correspondences.closedAt),
      ),
    )
  const ids = open.map((row) => row.id)
  if (ids.length === 0) return { people: [], ...desk }
  const labels = await correspondenceLabels(db, mantelId, ids)
  // Someone else still in it: a write link's correspondence has nobody.
  const stillThere = await db
    .select({ correspondenceId: members.correspondenceId })
    .from(members)
    .where(
      and(
        inArray(members.correspondenceId, ids),
        ne(members.userId, mantelId),
        isNull(members.leftAt),
      ),
    )
  return {
    people: [...labels.entries()]
      .filter(([id]) => stillThere.some((row) => row.correspondenceId === id))
      .map(([correspondenceId, label]) => ({ correspondenceId, name: label.name })),
    ...desk,
  }
}

/** For a route: who the request writes as, or a 404 for a mantel the caller may not write as. */
export async function requireAuthor(
  db: LettersDb,
  userId: string,
  mantelId?: string | null,
): Promise<string> {
  const author = await writingAs(db, userId, mantelId)
  if (!author) throw createError({ statusCode: 404, message: 'You do not keep that mantel.' })
  return author
}
