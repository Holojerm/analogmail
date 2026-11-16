# Auth, sessions, rate limiting, bot protection

Magic-link sign-in, OAuth providers, session revocation, the `rateLimit()` two-backend contract, and Turnstile. Several rules here are load-bearing security invariants — breaking one is a login bypass or an account-enumeration oracle, not a style regression.

> **Load this when:** touching anything under `server/api/auth/`, `server/utils/magic-link.ts`, `server/utils/rate-limit.ts`, `server/utils/turnstile.ts`, session handling, or adding an OAuth provider.
> Canonical index: [AGENTS.md](../../AGENTS.md).

---

## Auth Patterns


```typescript
// Protect a page client-side (UX only — see the warning below)
definePageMeta({ middleware: 'auth' })

// Access session in a page
const { loggedIn, user } = useUserSession()

// Protect a server route — THIS is the real boundary
const session = await getUserSession(event)
if (!session.user) throw createError({ statusCode: 401 })

// Or, for a gated route:
const { user } = await requireAccess(event) // 401 when signed out
```

**The client middleware is not a security boundary.** `app/middleware/auth.ts`
runs in the browser and exists so people see a login page instead of an empty one. Every gated
API route must call `requireAccess(event)` (or `requireUserSession`) itself, or the gate is
decorative.

**Sessions are revocable.** A sealed cookie has no server-side record, so
revocation needs both halves: every session carries `issuedAt`, and
`users.sessions_invalid_before` is the watermark that kills everything older.
`server/middleware/auth.ts` checks it on every `/api/*` request that carries a
session — one indexed read, deliberately uncached (`server/utils/session-guard.ts`
explains why a cache would reintroduce the bug). Deletion sets the watermark;
that is what makes "delete my account" end the session on the user's other
devices instead of only the one they clicked from. "Sign out everywhere" on
/account (`POST /api/account/sessions/revoke` → `revokeSessions()`) sets it too,
then re-issues the caller's own cookie from the same clock reading — the
watermark is stored in seconds and the guard is a strict less-than, so the
re-issued session survives and every other device's does not. Anything else
that must invalidate sessions sets the same column — do not add a second
mechanism.
The watermark is the per-user lever; `runtimeConfig.session.maxAge` in
`nuxt.config.ts` (30 days) is the ceiling on every session regardless, so a
leaked cookie cannot outlive it.

**Identity is the verified email address.** Signing in with a magic link today
and Google tomorrow on the same address lands on the same account by design.
That's only safe because every caller of `establishSession()` passes an explicit
`emailVerified` — an unverified address would be an account-takeover primitive.
Never default that flag to `true` when adding a provider. The magic-link path is
the one place where that flag is our own evidence rather than a third party's: the
token was mailed to that address and came back.


**Never put a secret in a URL a browser will keep.** Two flows here have to hand
someone a credential in a link — the sign-in link and the unsubscribe link — and
three places will happily record it: Cloudflare Logs (`event.path` includes the
query; use `pathForLog()`), the `Referer` the `/ingest` proxy forwards to
PostHog, and PostHog autocapture, which attaches `location.href` to every event.
Put the token in the **fragment** where possible, and scrub the rest through
`app/utils/analytics-privacy.ts`. Analytics access is handed out far more freely
than database access, which is exactly why nothing secret may travel there.

## Public API surface

`server/middleware/auth.ts` 401s every `/api/*` request without a valid session
except the allowlist in `server/utils/public-routes.ts`. Core ships:

- `/api/health` — liveness, public.
- `/api/auth/*`, `/api/_auth/*` — sign-in start, OAuth callbacks, the session
  endpoint `useUserSession()` reads. No session exists yet on these.
- `/api/status`, `/api/fleet` — for the portfolio dashboard. Both run
  `requireFleetToken()`: **404** when `NUXT_FLEET_TOKEN` is unset, **401** on a
  bad bearer. `/api/status` carries the build sha, migration tags and cron
  schedules — a deployment fingerprint, hence the token.
- `GET /api/fleet/feedback` — the feedback queue for the dashboard, same bearer;
  registered by the feedback layer, so removing the layer removes it.
- `GET /api/ops/events` — the ops spool for the `ops-triage` routine, behind its own bearer
  (`NUXT_OPS_TOKEN`) through the same `requireFleetToken()`: 404 unset, 401 wrong.
- `/api/_nuxt_icon/*` — `@nuxt/icon`'s endpoint, called by the browser for any
  icon the client bundle missed; static icon JSON.
- `GET|POST /api/email/unsubscribe` — reached from a mail footer on a device
  that may not be signed in.

Features and forks add their own from a Nitro plugin; **never edit the
middleware**:

```typescript
registerPublicApiRoutes([
  { path: '/api/problems', match: 'prefix', methods: ['GET'] }, // a public catalogue
  { path: '/api/join/', match: 'prefix', methods: ['POST'] },   // an invite link
])
registerSessionGatedPrefixes(['/posters/']) // private media served outside /api/
```

`methods` scopes a rule (omit for all methods), `match` is `exact` (default) or
`prefix` (`startsWith`; end a directory prefix with `/` so `/api/join/` does not
admit `/api/joinery`). The feedback layer registers `POST /api/feedback` this way
— signed-out visitors may leave feedback; the handler rate-limits by IP hash — so
removing the layer removes the route. `registerSessionGatedPrefixes` makes the
middleware require a session for a non-`/api/` prefix too.

Everything else is behind the session guard and then its own gate:
`requireAccess()` (signed-in only unless an app registers a stricter gate) or `requireAdmin()`.

## Rate Limiting

`rateLimit(event, { name, limit, windowSeconds })` — one call, two backends. It
prefers Cloudflare's **native Rate Limiting binding** (`[[ratelimits]]` in
`wrangler.toml`, resolved off `event.context.cloudflare.env`) and otherwise uses
the original **KV fixed window**. Applied to the whole `/api/auth/` surface in
`server/middleware/auth.ts` and per-user on connect-code minting. The magic-link
per-mailbox budget is **not** one of its call sites — it is counted in D1 (above).

The binding's `(limit, period)` is fixed at deploy — `limit({ key })` takes only a
key — so `chooseBackendAmong` delegates to it **only when both numbers match**
`NATIVE_LIMITER`, and everything else stays on KV. Don't relax that: routing a
20/60s handler through a 30/60s binding enforces 30 while `X-RateLimit-Limit: 20`
goes out on the response, and nothing fails. `period` may only be **10 or 60**.

- **A second native budget** (a stricter limit for an expensive create endpoint) is a second
  `[[ratelimits]]` block (own `name`, own `namespace_id`, in `[env.preview]` too) plus one line
  in a Nitro plugin, never an edit to `rate-limit.ts`:
  `registerNativeLimiter({ binding: 'GAME_CREATE_LIMITER', limit: 5, windowSeconds: 60 })`.
  A `rateLimit()` whose numbers equal a registered spec goes native; any other stays on KV.
  Two bindings with the same budget are refused. A fork's named budgets
  (`const INGEST_LIMITER = { name, limit, windowSeconds }`, passed straight to `rateLimit()`
  like `UNSUBSCRIBE_LIMITER`) belong in a file of the fork's own,
  not in `rate-limit.ts`.
- **`/ingest/**`** (the PostHog relay) can be rate-limited: off by default, because the KV
  backend costs a read and a write per relayed request. `configureIngestRelay({ rateLimit: true })`
  turns on 300 requests per 120s per address, on KV, keyed by `clientIpHash()` so the counters
  hold no visitor IPs. 120s is
  deliberately not a window the binding accepts, so it can never land on the per-colo limiter.
  An app that needs other numbers calls `configureIngestRelay({ limit, windowSeconds })` from a
  Nitro plugin (`server/utils/ingest-relay.ts`); don't edit the route. The relay also forwards
  an explicit header allowlist (`server/utils/ingest-headers.ts`), never `Cookie` or
  `Authorization`.
- Changing the auth limit means changing `NATIVE_LIMITER` **and** `wrangler.toml`.
  `test/rate-limit.test.ts` drives the real binding and fails when they drift.
- Both backends **fail open** (an outage in the abuse-control layer must not take
  sign-in down). A throwing binding does not cascade to KV — one policy, logged.
- The binding counts **per colo**; KV is eventually consistent. Either way this is
  abuse control, not metering. Anything you bill on needs a Durable Object. The
  residual: the per-IP auth limit is 30/60s *per Cloudflare location*, so a caller
  spread across colos gets a multiple of it. The per-mailbox budget has no such
  residual because D1 is single-writer and global.
- Each call site logs its backend once per isolate (`rate_limit_backend`), with a
  `reason` when it fell back. Read that before assuming the binding is in play.

## Bot Protection (Turnstile)

`requireTurnstile(event, token)` (`server/utils/turnstile.ts`) — throws 400 with a
`data.code` when a challenge fails. Wired on the two endpoints a stranger can
reach: `POST /api/auth/magic-link` and anonymous `POST /api/feedback`. Signed-in
feedback skips it, because `useFeedback().submit()` is also called
programmatically with no widget on screen.

- **Unset `NUXT_TURNSTILE_SECRET_KEY` = skipped**, like Resend. Site key without
  secret key is the one bad state and logs `turnstile_half_configured`.
- Render `<NuxtTurnstile>` behind a `useRuntimeConfig().public.turnstile.siteKey`
  check, never unconditionally — an unconfigured fork must load nothing.
- Unlike the rate limiters it **fails closed**: a bot check that failed open is a
  bypass an attacker can trigger by making `siteverify` slow.
- **On the mint path it runs first**, before the per-address bucket is charged.
  A challenge behind the limiter lets an unsolved bot burn a victim's budget and
  lock them out of their own sign-in — the limiter becomes the attack.
- `https://challenges.cloudflare.com` is already in `script-src` and `frame-src`.


