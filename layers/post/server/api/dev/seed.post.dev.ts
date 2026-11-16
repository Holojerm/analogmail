// POST /api/dev/seed — reset the three seed people and their letters. The
// `.dev` suffix keeps this route out of a production build.

import { db } from '@nuxthub/db'

import { officeSnapshot } from '../../dev/office'
import { seedThreePeople } from '../../dev/seed'
import { postNow } from '../../utils/clock'

export default defineEventHandler(async () => {
  await seedThreePeople(db, await postNow())
  return { office: await officeSnapshot(db) }
})
