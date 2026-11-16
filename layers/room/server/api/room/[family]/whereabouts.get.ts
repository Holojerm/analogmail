// GET /api/room/<family>/whereabouts — where each person in the family last
// said they were, and the map of those cities. The map is null until someone
// has said.

import { db } from '@nuxthub/db'

import { ROOM_MAP_SIZE } from '../../../../shared/utils/room-types'
import { requireRoom } from '../../../utils/room-access'
import { whereaboutsWithPlaces } from '../../../utils/room-checkins'
import { renderRoomMap } from '../../../utils/room-map'

export default defineEventHandler(async (event) => {
  const { user, family } = await requireRoom(event)
  const { people, places } = await whereaboutsWithPlaces(db, family.id)
  return {
    family,
    me: user.id,
    people,
    map: places.length ? renderRoomMap(places, ROOM_MAP_SIZE) : null,
  }
})
