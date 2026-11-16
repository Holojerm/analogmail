// Who is in a family. The room does not know: families belong to the letters
// layer, which the room never imports from. Whoever does know registers here,
// and every room request asks through it. With nothing registered, nobody is
// in any room.

import type { ExtensionDb } from '#server/utils/extensions'

import type { RoomFamily } from '../../shared/utils/room-types'

export type RoomDb = ExtensionDb

export interface RoomFamilies {
  /** The family as this person sees it, or null if they are not in it. */
  membership(db: RoomDb, userId: string, familyId: string): Promise<RoomFamily | null>
  /** Every family this person is in, closed ones included. */
  list(db: RoomDb, userId: string): Promise<RoomFamily[]>
}

let source: RoomFamilies | null = null

export const registerRoomFamilies = (families: RoomFamilies): void => {
  source = families
}
export const clearRoomFamiliesForTest = (): void => {
  source = null
}

export const roomFamily = async (db: RoomDb, userId: string, familyId: string) =>
  source ? source.membership(db, userId, familyId) : null

export const roomFamiliesOf = async (db: RoomDb, userId: string) =>
  source ? source.list(db, userId) : []
