// GET /api/room/<family>/issues — the gazettes and almanacs that are out.

import { db } from '@nuxthub/db'

import type { RoomIssueList } from '../../../../../shared/utils/room-issue'
import { requireRoom } from '../../../../utils/room-access'
import { listRoomIssues } from '../../../../utils/room-issues'

export default defineEventHandler(async (event): Promise<RoomIssueList> => {
  const { family } = await requireRoom(event)
  return { family, ...(await listRoomIssues(db, family.id, new Date())) }
})
