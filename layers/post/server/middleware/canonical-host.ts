// www.dearmantel.com is a second custom domain on the Worker (wrangler.toml).
// Every request to it is sent to the apex before anything else runs.

import { wwwRedirect } from '../../shared/utils/canonical-host'

export default defineEventHandler((event) => {
  const host = getRequestHost(event)
  if (!host.startsWith('www.')) return
  const url = getRequestURL(event)
  const target = wwwRedirect(
    host,
    useRuntimeConfig(event).public.appUrl,
    `${url.pathname}${url.search}`,
  )
  if (target) return sendRedirect(event, target, 301)
})
