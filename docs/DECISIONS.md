# Decisions

Choices made where the build prompt left room, newest last. Each has the reason, so it can be revisited.

## D1 — Next.js 16 (pending confirmation)
The prompt says Next.js 15. Next 16 is current and is what Budgeteer, the app this one's design comes from, already runs. Auth.js v5 declares support for both. **Waiting on Lemon's OK**; dropping to 15 changes nothing else in the plan.

## D2 — Auth.js v5 beta, pinned
`next-auth@5` has no stable release yet (latest is `5.0.0-beta.32`). It is the version the prompt asks for and is widely used in production, so it is installed at an exact version (no `^`), and upgrades are deliberate.

## D3 — SheetJS from the SheetJS CDN
The `xlsx` package on npm stopped at 0.18.5 and is missing later security fixes. SheetJS publishes current releases on `cdn.sheetjs.com`, and their install docs use that tarball. It is pinned to an exact version in `package.json`.

## D4 — bcryptjs for passwords
Pure JavaScript, so nothing native to build on Vercel. Cost factor 12.

## D5 — Postgres-backed rate limiting
In-memory counters reset per serverless instance and don't limit anything on Vercel. A small `rate_limits(key, window_start, count)` table with an upsert is enough for login and the public member routes.

## D6 — Repeat-pair figure counted per session
In November, 43 sessions are filled by a non-couple pair, and 34 of those sessions use a pair that also served together in September. Counted as distinct pairs, it is 26 of 34. The app's "repeated pairs" card uses the per-session count, matching the prompt's "34 of 43".

## D7 — Member tokens stored as a hash
32 random bytes, base64url, shown once when created or regenerated. Only the SHA-256 hash is stored, so a database leak doesn't hand out working links.

## D8 — Design system from Budgeteer, colours from the prompt
Budgeteer's token structure, hairline-border cards, glass tiers, motion vocabulary and UI primitives are ported. The colours, fonts (Inter + Space Grotesk) and 12px radius are the prompt's. See `PLAN.md` §5.

## D9 — No commits or pushes by Claude
Lemon makes the commits. Each milestone ends with a summary and a suggested commit message instead.

## D10 — Server-side PDF later, not now
`/print/[month]` + `window.print()` is the PDF path. A later option is `@sparticuz/chromium` + `puppeteer-core` on Vercel for one-click downloads; not built now.

## D11 — Cache Components off
Next 16's new projects turn on `cacheComponents`, under which any request-time read (the session cookie, a database query for the signed-in user) must sit inside a `<Suspense>` boundary or the build fails. Every page in this app is exactly that kind of read, and nothing benefits from a prerendered static shell. It is off in `next.config.ts`, using the previous rendering model, which is simpler to work in. Pages still render on the server; `loading.tsx` gives the instant skeleton.

## D12 — The proxy only checks for a session cookie
Next recommends proxy (formerly middleware) do optimistic checks only. It redirects to `/login` when there is no Auth.js session cookie, keeping the page asked for. It does not decode the token or touch the database; `requireUser()` / `requireRole()` in every page and server action is the real check. This also keeps Auth.js and the database driver out of the proxy bundle.

## D13 — Vitest 3, not 5
Vitest 5 needs Node 22 (`Map.groupBy`); this machine runs Node 20.20. Vitest 3 covers everything the tests need. Revisit when Node is upgraded.

## D14 — Rota answers (18 Nov 2026)
- **Week rule:** `calendar_week` — Week n is the n-th Monday–Sunday week whose Friday falls in the month. Matches "Week 1 · 3 – 8 Nov" and "Week 2 (Fri 13 – Sun 15 Nov)".
- **Month edges:** a session whose date falls outside the month is **dropped** (e.g. July's Week 1 Tuesday, 30 June). Not answered explicitly; this was the suggested default.
- **5th week:** scheduled (`include_fifth_week = true`).
- **Mixed pairs:** only couples. A Bro with a Sis is allowed only when they are a couple; "Allow mixed pair here" stays available as a deliberate per-session override.
- **Couples:** the six in the seed. Kwabena Adusei Snr & Davida Adusei are **not** a couple.
- **Titles:** shown as unconfirmed until ticked in the Members screen.
- **Repeat window:** 3 months (not answered explicitly; the prompt's default).
- **Privilege limits:** not given yet. Placeholders 2 / 4 / 6, and everyone starts as a publisher; both are editable in the app.

## D15 — Next.js 16.4.6, latest
Confirmed by Lemon. Auth.js v5 beta works with it.
