import { registerRoomFamilies } from '#layers/room/server/utils/room-families'

import { familiesForRoom, familyMembersForRoom } from '../utils/families'
import { registerLettersExtensions } from '../utils/letters-extensions'

export default defineNitroPlugin(() => {
  registerLettersExtensions()
  // Families live here; the room asks who is in one and learns nothing else.
  registerRoomFamilies({
    membership: async (db, userId, familyId) =>
      (await familiesForRoom(db, userId, familyId))[0] ?? null,
    list: (db, userId) => familiesForRoom(db, userId),
    members: (db, familyId) => familyMembersForRoom(db, familyId),
  })
})
