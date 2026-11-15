# SEO and AEO

The `useSeo()` one-call-per-page contract, how `publicPage` meta feeds both `sitemap.xml` and `llms.txt`, and structured-data rules.

> **Load this when:** adding or editing a page, writing structured data, or changing crawler behaviour.
> Canonical index: [AGENTS.md](../../AGENTS.md).

---

## SEO & AEO

- **Every page calls `useSeo()` exactly once.** It is the only thing that emits
  `<link rel="canonical">`, Open Graph, Twitter cards, and JSON-LD. `bun run seo:check`
  (part of `bun run ci`) fails the build on a page that skips it or that calls
  `useSeoMeta()`/`useHead()` to set SEO tags directly.
- **Public pages declare themselves**: `definePageMeta({ publicPage: { changefreq, priority, title, summary } })`.
  That one declaration is what puts a page in **both** `sitemap.xml` and `llms.txt` —
  there is no list to update. A page without it is in neither, which is the right
  default. `noindex: true` and `publicPage` are mutually exclusive and the gate enforces it.
- **A dynamic route cannot reach either file that way.** The collecting hook skips any path
  containing `:`, because a dynamic route is one pattern rather than N URLs. **Any set of
  URLs an app owns is registered, not hand-added to the routes**: from a Nitro plugin,
  `registerPublicPageSource({ key, list(db, { buildDate }), llmsHeading?, defaults? })`
  (`server/utils/public-pages.ts`) puts each returned `{ path, title?, description?, lastmod? }`
  in `sitemap.xml`, and in `llms.txt` under `llmsHeading` when it names one. A source that throws
  is logged, skipped, and makes both documents `no-store`.
  `registerRobotsDisallow(['/sessions'])` adds private paths to `robots.txt` (wildcard group
  and every named AI crawler). The page still declares `publicPage` (the gate's invariant is
  per-page), with a comment saying the values are inert. The three routes stay identical in
  every fork.
- **Never write FAQ (or any) JSON-LD for content that isn't rendered.** Build the markup from
  the same source the page renders. Structured data describing invisible content is a
  manual-action risk with Google and a lie an answer engine will repeat.
- **Prices go into schema as numbers**, never display strings.
- Structured-data builders live in `shared/utils/schema.ts` and are pure functions of a
  `SiteContext` — add a node type there, unit-test it, then pass it via `useSeo({ schema: [...] })`.
- `NUXT_PUBLIC_INDEXABLE=false` on preview deploys makes robots.txt disallow everything,
  every page render `noindex`, and sitemap/llms.txt go empty. `NUXT_PUBLIC_ALLOW_AI_CRAWLERS=false`
  blocks the named answer-engine crawlers (`server/utils/seo.ts` › `AI_CRAWLERS`); it defaults
  to **true** because being quotable by an answer engine is distribution for a SaaS marketing site.
- **IndexNow** (`server/utils/indexnow.ts`): the 04:00 `seo:indexnow` task reads this app's own
  `/sitemap.xml` and submits every URL whose `<lastmod>` is on or after the last accepted run,
  so Bing (and through it ChatGPT search, Copilot, DuckDuckGo) recrawls changed pages within
  minutes. It reads the served sitemap rather than rebuilding the list, so a fork's custom
  sitemap route needs no port. Opt in with `NUXT_INDEXNOW_KEY` in `[vars]` (8–128 of
  `[A-Za-z0-9-]`, `openssl rand -hex 16`); `/indexnow-key.txt` serves it. It is not a secret.
  Preview deploys and non-https origins never ping. State lives in KV at
  `seo:indexnow:last-submitted` and only advances on a 200/202, so a failed day is resubmitted.
- **`sameAs`**: `runtimeConfig.public.sameAs` lists the organization's own profiles (GitHub, X,
  LinkedIn, Wikidata) and becomes `Organization.sameAs`. Set it when another entity shares the
  name; it is the signal that tells them apart.

## Share cards (og:image)

Every public page gets its own 1200x630 card, drawn at **build time** and served as a static
asset, so the Worker bundle does not grow. `bun run build` runs `scripts/og-images.ts` before
`nuxt build` and `--check` after it.

- **Where cards come from**: every static page with a literal `publicPage` (its `title` and
  `summary` become the card's text), and any
  `layers/*/og-cards.ts` whose default export returns `{ path, title, summary? }[]`. A fork's
  own layer uses that last hook to card the dynamic routes it enumerates (a record's page, a
  per-item landing page); the same module may export `ogHost(path)` to name the footer host of pages
  served somewhere other than the app's own origin. The home page keeps the site card, `public/og.png`.
- **How a page finds its card**: `useSeo()` links `/og/<route>.png` (`ogCardPath()` in
  `shared/utils/og.ts`) when the route is static and declares `publicPage`, else the site card. A
  dynamic route names its own: `useSeo({ image: ogCardPath(route.path) })`.
  A card for a route nothing drew is a broken preview, so register the card in the same change.
- **Drawing**: `satori` (layout to SVG) and `@resvg/resvg-js` (SVG to PNG), both
  devDependencies. Fonts are the families named in `main.css`, read from `@fontsource/<family>`
  in `node_modules` (woff, not woff2), so no network is needed; a family without a package fails
  the build with the `bun add -d` line to run. Colors are the `og-*` roles, resolved to hex by
  `bun run brand:generate` into `shared/utils/brand-colors.generated.ts` (a build has no
  browser). The card layout lives in `scripts/lib/og-render.ts`; edit it for a rebrand.
- **Not here**: anything that changes between builds. A card is a title and one line of
  context, never a live number. Per-record cards that must be drawn per request would need a
  runtime renderer, which this template deliberately does not ship (the compressed Worker
  limit on the free plan is about 3 MB).
- `public/og/` is gitignored and absent under `bun dev`, so a dev render links to a missing
  file; run `bun run og:build` to see them locally.

## Search console verification (once per domain, by hand)

Both consoles want the owner's own login, so an agent cannot finish this. Use DNS, not a
meta tag: it survives redesigns and needs no deploy.

1. **Google Search Console** → Add property → *Domain* → copy the `google-site-verification=…`
   TXT value. Add it at the apex with `cf` (find the command with
   `cf cli search "create dns record"`). Verify, then Sitemaps → submit `/sitemap.xml`.
2. **Bing Webmaster Tools** → *Import from Google Search Console* (fastest; carries the
   sitemap), or add the site and verify by DNS the same way.
3. Both report indexed pages, query impressions and inbound links, which nothing else here can.
