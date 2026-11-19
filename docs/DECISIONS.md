# Decisions

Choices made where the build prompt left room, newest last. Each has the reason, so it can be revisited.

## D1 — Next.js 16 (pending confirmation)
The prompt says Next.js 15. Next 16 is current and is what Budgeteer, the app this one's design comes from, already runs. Auth.js v5 declares support for both. **Waiting on Lemon's OK**; dropping to 15 changes nothing else in the plan.

## D2 — Auth.js v5 beta, pinned
`next-auth@5` has no stable release yet (latest is `5.0.0-beta.32`). It is the version the prompt asks for and is widely used in production, so it is installed at an exact version (no `^`), and upgrades are deliberate.

## D3 — SheetJS from the SheetJS CDN (replaced by D23 and D28)
The plan was SheetJS from its own CDN, because the npm `xlsx` package stopped at 0.18.5. In the end ExcelJS does both export (D23) and import (D28), so SheetJS isn't used.

## D4 — bcryptjs for passwords
Pure JavaScript, so nothing native to build on Vercel. Cost factor 12.

## D5 — Postgres-backed rate limiting
In-memory counters reset per serverless instance and don't limit anything on Vercel. A small `rate_limits(key, window_start, count)` table with an upsert is enough for login and the public member routes.

## D6 — Repeat-pair figure counted per session
In November, 43 sessions are filled by a non-couple pair, and 34 of those sessions use a pair that also served together in September. Counted as distinct pairs, it is 26 of 34. The app's "repeated pairs" card uses the per-session count, matching the prompt's "34 of 43".

## D7 — Member tokens stored as a hash
32 random bytes, base64url. Looked up by SHA-256 hash, so a database leak doesn't hand out working links. *Amended by D26.*

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

## D16 — Old sheets: a column that doesn't fit the weeks is dated by n-th weekday
The seed's July 2026 has a Week 1 Tuesday. Under Mon–Sun weeks that is 30 June, and shifting just that row to 7 July lands it on Week 2's Tuesday — the database's one-session-per-slot-per-day rule caught it. A hand-filled sheet's four Tuesday rows can only mean that month's four Tuesdays (7, 14, 21, 28), so when any row of a slot's column falls outside the month, **that whole column** is dated by n-th weekday. This is for importing history only; generated months use the week rule and drop dates outside the month (D14). The seed reports it as a note.

## D17 — Seed only adds people, never overwrites them
Re-running `pnpm db:seed` updates locations and slots from the file, adds members and couples that aren't there, and replaces previously imported months. It never changes a member that already exists, so a confirmed title, a phone number or a privilege set in the app survives. A month with anything made in the app (a generated or manual assignment) is skipped and reported.

## D18 — A couple that changes keeps its past sessions
Re-pairing someone deletes the old couple row, but first clears the couple link on its past assignments rather than deleting them: the sessions stay in the history as an ordinary pair.

## D19 — Local Postgres without Docker
`pnpm db:local` (PGlite over the Postgres protocol) gives a database for trying the app before Neon is set up and for offline work. The DB client uses node-postgres for `localhost` URLs and Neon's drivers otherwise. Tests use PGlite in memory with every migration applied, so constraints, the pair-history view and transactions are tested for real.

## D20 — How special days combine (milestone 3)
- **Order:** recurring rules apply first, then one-off days, so a one-off day placed on top of Sanitation Day has the last word.
- **Cancel is final.** Once a session is cancelled, no later rule moves it again.
- **The three recurring actions:** *off before cutoff* turns off slots that end by the cutoff and moves slots running past it to start at the cutoff, keeping their end time. *Shift all* moves every slot starting before the cutoff to start at it. *Cancel matching* cancels slots starting before the cutoff, or the whole day when no cutoff is set.
- **Overlaps are shown, not prevented.** When a rule makes two sessions at one place overlap, the preview warns about it. Prevention would make some legitimate setups impossible to enter.
- **One resolver everywhere.** The rule editor's preview, the schedule month view and (from milestone 4) the generator all call `resolveMonthSessions`, so they can't disagree.

## D21 — The schedule shows a month before it is built
`/schedule` opens the current Accra month. A month with no schedule shows its sessions resolved from today's slots and special days, marked "Not built". A month with a schedule shows what is stored. For an imported month, that is what was actually served, even where slots have changed since. In the week label, "3 – 8 Nov" comes from the dates that have sessions, matching the old sheets; Settings shows the full Mon–Sun range ("2 – 8 Nov") because it is explaining the rule.

## D22 — Scheduler choices (milestone 4)
- **Weights** (lower total is better, all editable through `settings.scoring_weights`): unfilled session 1000, a broken hard rule 500, repeat from 1 / 2 / 3 months ago 100 / 60 / 30, older but inside the window 15, same pair twice in a month 150, fairness 120 × the squared spread of sessions÷limit within each privilege, twice in one week 40, consecutive weeks 15, same slot again 5, preferred location −5, "prefer" pair −20.
- **Leaving a session empty beats breaking a limit.** With the placeholder limits (everyone a publisher at 2), 41 people give 82 places and December needs 92, so 5 sessions stay empty. The builder says so in a banner before anyone generates. The engine never places one person alone in an empty session.
- **Couples** usually serve together but can also serve in a same-gender pair (see D24). A couple marked "Always together" only ever serves with each other.
- **"Last month" for repeats** is the most recent earlier month in the history, which for November is September (there is no October), matching "34 of 43". The penalties use the calendar age, so September costs 60 when building November.
- **Hand edits can break rules.** The picker allows anyone, and the evaluation marks what it breaks (badges, the Clashes card, the warnings). Suggestions never break a hard rule.
- **Published months can still be edited by hand.** Only Regenerate needs "Back to draft", so last-minute swaps don't mean unpublishing. Published and imported months count as pair history; drafts don't.
- **Drag and drop swaps whole cells.** "Allow mixed pair" stays with the session, not the people. Locked cells can't be dragged or dropped on.
- **Sessions follow the slots and special days on every Generate.** New ones are added, changed times updated, and removed ones deleted with their pairs. A cancelled session loses its pair.
- **Speed:** 300 seeded greedy passes plus local search. A December built from the seed takes about 150–250 ms, and a random 50 × 50 month about 250 ms.

## D23 — ExcelJS for the .xlsx export, SheetJS for import (confirmed by Lemon, 19 Nov 2026)
SheetJS's free Community Edition writes merged cells, widths and heights but not fills, fonts or bold; those are in the paid Pro edition. So the exported sheet would lose the green and blue title bars and the grey Sanitation Day cells. Export uses **ExcelJS 4.4.0** (MIT), which writes all of it plus A4 page setup. SheetJS stays the choice for reading old `.xlsx` sheets in milestone 8, as the prompt says. The export names Calibri rather than Carlito: Carlito is Calibri's free, metric-compatible twin, and Excel already has Calibri.

## D24 — Couples can also serve apart (confirmed by Lemon, 19 Nov 2026)
The seed notes say a spouse sometimes serves with someone else (July: Comfort Owusua & Ruth Agbanawo). `couples.always_together` now defaults to **false**, and migration 0001 sets it to false for existing couples. A couple still serves together most of the time, because a couple carries no repeat penalty. The member editor has an "Always together" switch for any couple that should never be split.

## D25 — The printed sheet
- One grid model (`src/lib/print/sheet.ts`) feeds the editor, the PDF and the export, so they can't drift apart. Cells are addressed "B7", and that ref is the key for typed text, widths are keyed by column letter, heights by row number.
- Each location prints as its own full-width table, as in the original PDF. "Shrink to fit page width" stretches or shrinks the columns to the page in proportion to the editor's widths; with it off, columns print at their real widths and the preview warns if they're too wide.
- Typed text for a cell that no longer exists (a month gained or lost a week) is ignored rather than drawn somewhere else.
- Margins: normal 12.7 mm, narrow 6.35 mm. "Updated" is the last change to a pair, the schedule or the layout.
- A month that hasn't been generated can be previewed, copied and printed, but not edited, because the layout belongs to a schedule.

## D26 — Member links can be shown again (amends D7)
The monthly preview puts each person's own link in their message, so the app must be able to produce it again; a hash alone can't. Each token is also stored **encrypted** (AES-256-GCM, key derived from `AUTH_SECRET` by HKDF). Lookups still use the hash. A copy of the database without the server's secret still opens nothing. Changing `AUTH_SECRET` means links can't be shown again (they still work); "Make a new link" fixes that per person. Links made before this change show "Make a new one".

## D27 — Weekend message: MTN first, and the blocks are built in code
Lemon's Thursday message starts with the MTN office, so the seed sets that order (only if none was chosen). It can be changed on Messages → This weekend. The weekend template is `{greeting} @all` + `{weekend_blocks}`; each block's intro and closing lines are fixed wording from his message, and "Edit before copying" covers one-off changes. A special day's message note is added to the block as "*Note:* …". The monthly preview's session lines read "with Sis X at <location>" rather than "– <location>", because the locations' own names already contain a dash.

## D28 — ExcelJS reads old sheets too (amends D23)
D23 kept SheetJS for importing. Installing SheetJS needs its CDN tarball, which this environment wouldn't download and run, and ExcelJS — already here for export — reads merged cells and fills, which is what the layout detection needs. So import uses ExcelJS as well. The round-trip test exports November with our exporter, imports it as another month, and gets every pair back.

## D29 — Accounts are checked on every request
Sessions are 30-day JWTs, so a removed account or a changed role would otherwise keep working until the token expired. `currentUser()` reads the user row once per request (cached for that request) and treats a removed account as signed out. Invites: the owner gets a one-time link (hashed, 7 days); until it's used the account can't sign in. There's still no public sign-up.

## D30 — Members confirm per person
An assignment has one status for the pair, so confirmations are kept per person (`assignments.confirmed_member_ids`); the status becomes confirmed when both have. "I can't make it" opens a swap request with the engine's top three replacements; the builder shows it with "Ask … on WhatsApp", "Open session" and "Keep them". Replacing the person in the session closes the request. Members only ever see published months, their own sessions and their partner's name.

## D31 — A basic Content Security Policy
Everything is served from the app's own origin. Next's inline scripts need `'unsafe-inline'` without per-request nonces; tightening that to nonces is possible later. `Referrer-Policy: same-origin` keeps a member's token (in the path) from being sent to Google or WhatsApp when they tap a link; member pages also send `no-referrer` and `X-Robots-Tag: noindex`.

