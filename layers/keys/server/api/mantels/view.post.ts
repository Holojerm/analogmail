// POST /api/mantels/view — one mantel as a keeper sees it: who keeps it, the
// caller's own wrapped copy of its key, and its open custody proposals.

import { db } from '@nuxthub/db'
import { eq, inArray } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { proposalsOf } from '../../utils/custody'
import { getMantel } from '../../utils/mantels'

const bodySchema = z.object({ id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id } = await readValidatedBody(event, bodySchema.parse)
  const mantel = await getMantel(db, user.id, id)
  if (!mantel) throw createError({ statusCode: 404, message: 'You do not keep that mantel.' })

  const { users, people } = tables
  const proposals = await proposalsOf(db, user.id, id, await postNow())
  const ids = [
    ...mantel.keepers.map((keeper) => keeper.userId),
    ...proposals.map((proposal) => proposal.subjectId).filter((who): who is string => Boolean(who)),
  ]
  const named = await db
    .select({ id: users.id, account: users.name, chosen: people.displayName })
    .from(users)
    .leftJoin(people, eq(people.userId, users.id))
    .where(inArray(users.id, ids))
  const nameOf = (who: string | null) => {
    const row = named.find((entry) => entry.id === who)
    return row ? (row.chosen ?? row.account) : null
  }

  return {
    ...mantel,
    me: user.id,
    keepers: mantel.keepers.map((keeper) => ({ ...keeper, name: nameOf(keeper.userId) })),
    proposals: proposals.map((proposal) => ({ ...proposal, name: nameOf(proposal.subjectId) })),
  }
})
