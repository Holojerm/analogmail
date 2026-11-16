// GET /api/room/<family>/issues/<issue> — one gazette ('2026-10') or almanac
// ('2026'), built from the room as it stands now.

import { db } from '@nuxthub/db'

import { requireRoom } from '../../../../utils/room-access'
import { readRoomIssue } from '../../../../utils/room-issues'

export default defineEventHandler(async (event) => {
  const { family } = await requireRoom(event)
  const issue = await readRoomIssue(db, family, getRouterParam(event, 'issue') ?? '', new Date())
  if (!issue) throw createError({ statusCode: 404, message: 'There is no issue for that time.' })
  return issue
})
