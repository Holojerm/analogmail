// Every room route starts here: a signed-in person, and the family in the
// address as they see it. Someone who is not in that family gets the same
// answer as for a family that does not exist.

import { db } from '@nuxthub/db'
import type { H3Event } from 'h3'
import { z } from 'zod'

import { roomFamily } from './room-families'

const familyIdSchema = z.string().uuid()

export async function requireRoom(event: H3Event) {
  const { user } = await requireUserSession(event)
  const id = familyIdSchema.safeParse(getRouterParam(event, 'family'))
  const family = id.success ? await roomFamily(db, user.id, id.data) : null
  if (!family) throw createError({ statusCode: 404, message: 'You are not in that family.' })
  return { user, family }
}

/** Turns a refusal from room-photos.ts into the response it deserves. */
export function refuseRoomChange(result: 'not-found' | 'not-yours' | 'no-album', what: string) {
  if (result === 'not-yours') {
    return createError({
      statusCode: 403,
      message: `Only whoever added that ${what}, or the organiser, can change it.`,
    })
  }
  if (result === 'no-album') {
    return createError({ statusCode: 400, message: 'That album no longer exists.' })
  }
  return createError({ statusCode: 404, message: `That ${what} is not in this room.` })
}
