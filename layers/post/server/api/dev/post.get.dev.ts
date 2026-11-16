// GET /api/dev/post — the simulated time, each person's next delivery and the
// notice outbox. The `.dev` suffix keeps this route out of a production build.

import { db } from '@nuxthub/db'

import { officeSnapshot } from '../../dev/office'

export default defineEventHandler(() => officeSnapshot(db))
