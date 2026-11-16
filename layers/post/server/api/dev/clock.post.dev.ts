// POST /api/dev/clock — move the simulated time, running the release at every
// delivery hour on the way. The `.dev` suffix keeps this route out of a
// production build.

import { db } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import { nextPickup } from '../../../shared/utils/postmark'
import { nextRelease } from '../../../shared/utils/release'
import { advanceTo, rescheduleAll } from '../../dev/advance'
import { officeSnapshot } from '../../dev/office'
import { postNow, setClockOffsetMs } from '../../utils/clock'
import { releaseStateOf } from '../../utils/release-run'

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('hour') }),
  z.object({ action: z.literal('pickup') }),
  z.object({ action: z.literal('mail-day'), userId: z.string().min(1) }),
  z.object({ action: z.literal('reset') }),
])

const HOUR_MS = 60 * 60 * 1000

async function target(body: z.infer<typeof bodySchema>, now: Date): Promise<Date> {
  const { postalProfiles } = tables
  if (body.action === 'reset') return new Date()
  if (body.action === 'hour') return new Date(now.getTime() + HOUR_MS)
  if (body.action === 'pickup') {
    const zones = await db.selectDistinct({ zone: postalProfiles.timeZone }).from(postalProfiles)
    const pickups = zones.map(({ zone }) => nextPickup(now, zone).at.getTime())
    return new Date(pickups.length > 0 ? Math.min(...pickups) : now.getTime())
  }
  const [profile] = await db
    .select()
    .from(postalProfiles)
    .where(eq(postalProfiles.userId, body.userId))
  if (!profile) throw createError({ statusCode: 404, message: 'No such person' })
  const release = nextRelease(now, releaseStateOf(profile))
  // Already due means the run below delivers it; time never moves backwards.
  return new Date(Math.max(release.at.getTime(), now.getTime()))
}

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const from = await postNow()
  const to = await target(body, from)
  await setClockOffsetMs(to.getTime() - Date.now())
  if (body.action === 'reset') await rescheduleAll(db, to)
  const report = await advanceTo(db, from, to)
  return { report, office: await officeSnapshot(db) }
})
