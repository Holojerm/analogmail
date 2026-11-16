// Every 15 minutes: deliver the mail that is due (../utils/release-run.ts).
//
// Wired like every scheduled task, in two places that must agree:
// `SCHEDULED_TASKS` in nuxt.config.ts and `[triggers] crons` in wrangler.toml.
//
// Hand-run in dev: curl https://analogmail.localhost/_nitro/tasks/release-mail

import { db } from '@nuxthub/db'

import { logEvent } from '#server/utils/log'
import { recordOpsEvent } from '#server/utils/ops'

import { postNow } from '../utils/clock'
import { runRelease } from '../utils/release-run'

export default defineTask({
  meta: {
    name: 'release-mail',
    description: 'Deliver due letters to each mailbox at its delivery hour',
  },
  async run() {
    const started = Date.now()
    try {
      const report = await runRelease(db, await postNow())
      logEvent('info', 'release_mail', { ...report, durationMs: Date.now() - started })
      return { result: report }
    } catch (err) {
      // Not rethrown: the next run, 15 minutes on, picks up everyone this one
      // left due, and a release missed earlier the same day still happens.
      logEvent('error', 'release_mail_failed', { error: String(err) })
      await recordOpsEvent(db, { kind: 'release_failed', detail: String(err) })
      return { result: 'failed' }
    }
  },
})
