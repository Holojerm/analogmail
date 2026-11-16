// PUT /api/post/profile/mail — change mail days and the delivery hour, from tomorrow.

import { db } from '@nuxthub/db'

import { postNow } from '../../../utils/clock'
import { getProfile } from '../../../utils/profile'
import { changeMailSettings, mailSettingsSchema } from '../../../utils/profile-settings'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, { name: 'profile', limit: 10, windowSeconds: 60, identifier: user.id })
  const body = await readValidatedBody(event, mailSettingsSchema.parse)
  if ((await changeMailSettings(db, user.id, body, await postNow())) === 'no-profile') {
    throw createError({ statusCode: 409, message: 'Choose your city first.' })
  }
  return { profile: await getProfile(db, user.id) }
})
