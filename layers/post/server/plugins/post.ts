// What the post office registers with core: its public routes and how loud
// each of its ops kinds is on the fleet dashboard.
import { eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { registerAccountContributor } from '#server/utils/extensions'
import { registerOpsSeverity } from '#server/utils/ops-severity'
import { registerPublicApiRoutes } from '#server/utils/public-routes'

export default defineNitroPlugin(() => {
  // Resend calls this with no session; the route checks the Svix signature.
  registerPublicApiRoutes([{ path: '/api/webhooks/resend', methods: ['POST'] }])
  // The dev clock works signed out. In a production build `import.meta.dev`
  // is `false` and its routes do not exist.
  if (import.meta.dev) registerPublicApiRoutes([{ path: '/api/dev/', match: 'prefix' }])

  // Deleting an account deletes where its mail arrived and its notices.
  registerAccountContributor({
    key: 'post',
    deletionStatements: (db, userId) => [
      db.delete(tables.postalProfiles).where(eq(tables.postalProfiles.userId, userId)),
      db.delete(tables.notices).where(eq(tables.notices.userId, userId)),
    ],
  })

  registerOpsSeverity({
    release_failed: {
      severity: 'critical',
      action: 'Mail is not being delivered. Check the release-mail task logs and D1.',
    },
    release_profile_failed: {
      severity: 'warning',
      action: 'One mantel cannot be scheduled. Check its time zone and mail days.',
    },
    notice_dispatch_failed: {
      severity: 'warning',
      action: 'Mail arrives but nobody is told. Check the release-mail task logs.',
    },
    notice_failed: {
      severity: 'warning',
      action: 'A notice could not be sent. Check Resend and the email queue.',
    },
    // Handled: the letters went back to their senders.
    notice_bounced: { severity: 'info' },
  })
})
