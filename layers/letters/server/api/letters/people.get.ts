// GET /api/letters/people — who the person writes with, and their open invitations.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { listPeople } from '../../utils/correspondences'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return listPeople(db, user.id, await postNow())
})
