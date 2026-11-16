// GET /api/room/<family>/export — what a member's own copy of the room is
// made from. Their browser fetches the pictures and builds the files.

import { db } from '@nuxthub/db'

import type { RoomExport } from '../../../../shared/utils/room-export'
import { requireRoom } from '../../../utils/room-access'
import { whereabouts } from '../../../utils/room-checkins'
import { roomExportPhotos } from '../../../utils/room-export'

export default defineEventHandler(async (event): Promise<RoomExport> => {
  const { family } = await requireRoom(event)
  return {
    family,
    photos: await roomExportPhotos(db, family.id),
    people: await whereabouts(db, family.id),
  }
})
