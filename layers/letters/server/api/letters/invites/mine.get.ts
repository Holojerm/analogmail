// GET /api/letters/invites/mine — invitations sent to the caller's own address
// that they have not accepted.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { listInvitesSentTo } from '../../../utils/invites'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return { invitations: await listInvitesSentTo(db, user, await postNow()) }
})
