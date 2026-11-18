// Every 15 minutes: deliver the mail that is due (../utils/release-run.ts),
// then send the notices that queued (../notify/dispatch.ts).
//
// Wired like every scheduled task, in two places that must agree:
// `SCHEDULED_TASKS` in nuxt.config.ts and `[triggers] crons` in wrangler.toml.
//
// Hand-run in dev: curl https://dearmantel.localhost/_nitro/tasks/release-mail

import { db } from '@nuxthub/db'

import { logEvent } from '#server/utils/log'
import { recordOpsEvent } from '#server/utils/ops'

import { currentNotifier, pushNotice } from '../notify/current'
import { dispatchNotices } from '../notify/dispatch'
import { postNow } from '../utils/clock'
import { runRelease } from '../utils/release-run'

// Neither step rethrows: the next run, 15 minutes on, picks up everyone and
// everything this one left, and a release missed earlier the same day still
// happens. The steps fail separately so a mail outage never holds up delivery.
async function step<T>(kind: string, run: () => Promise<T>): Promise<T | 'failed'> {
  try {
    return await run()
  } catch (err) {
    logEvent('error', kind, { error: String(err) })
    await recordOpsEvent(db, { kind, detail: String(err) })
    return 'failed'
  }
}

export default defineTask({
  meta: {
    name: 'release-mail',
    description: 'Deliver due letters to each mantel at its delivery hour, then send notices',
  },
  async run() {
    const started = Date.now()
    const now = await postNow()
    const release = await step('release_failed', () => runRelease(db, now))
    const notices = await step('notice_dispatch_failed', async () =>
      dispatchNotices(db, await currentNotifier(), now, { push: pushNotice }),
    )
    logEvent('info', 'release_mail', { release, notices, durationMs: Date.now() - started })
    return { result: { release, notices } }
  },
})
