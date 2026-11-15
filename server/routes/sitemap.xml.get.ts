// GET /sitemap.xml
//
// The URL list is NOT maintained here. Static pages declare their own
// membership with `definePageMeta({ publicPage: … })`; the `pages:resolved`
// hook in nuxt.config.ts collects those at build time into
// `runtimeConfig.publicPages`, and this route renders whatever the route table
// actually contained.
//
// That indirection exists because the previous version of this file was a
// hand-kept array, and a hand-kept array is a second place to remember. Add
// /changelog, ship it, and it is simply never in the sitemap — nothing fails,
// nobody notices. Now the page that exists is the page that gets listed, and
// `scripts/check-seo.ts` fails the build if an indexable page forgets to
// declare itself.
//
// This app has no blog, so `posts` is always empty.
//
// Pages an app owns beyond the static ones (a catalogue, public profiles) come from
// registered sources — server/utils/public-pages.ts — so this file stays
// identical in every fork. With none registered the query below is skipped.
//
// Everything this route decides lives in `sitemapResponse()`, which is a pure
// function this repo can actually test. What is left here is config, one query,
// and two assignments — see that function for why the split is deliberate.

import { db } from '@nuxthub/db'

import { collectPublicPages } from '../utils/public-pages'
import { sitemapResponse } from '../utils/seo'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const appUrl = config.public.appUrl
  const indexable = config.public.indexable !== false

  setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')

  const dynamic =
    indexable && appUrl
      ? await collectPublicPages(db, { buildDate: config.buildDate })
      : { entries: [], complete: true }

  const { body, cacheControl } = sitemapResponse({
    appUrl,
    indexable,
    buildDate: config.buildDate,
    pages: config.publicPages ?? [],
    posts: [],
    dynamic: dynamic.entries,
    complete: dynamic.complete,
  })

  setResponseHeader(event, 'Cache-Control', cacheControl)
  return body
})
