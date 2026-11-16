// GET /api/room/<family> — the room as one of its members sees it.

import { db } from '@nuxthub/db'

import { ROOM_FAMILY_BYTES_MAX } from '../../../../shared/utils/room-types'
import { requireRoom } from '../../../utils/room-access'
import { listRoomAlbums, roomUsage } from '../../../utils/room-photos'

export default defineEventHandler(async (event) => {
  const { user, family } = await requireRoom(event)
  return {
    family,
    me: user.id,
    albums: await listRoomAlbums(db, family.id),
    usage: { ...(await roomUsage(db, family.id)), limit: ROOM_FAMILY_BYTES_MAX },
  }
})
