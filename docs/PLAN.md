# PW Scheduler — plan

Status: **approved 18 Nov 2026.** All eight milestones are built; answers to the questions are in DECISIONS D14. The build prompt is saved next to this file as `BUILD-PROMPT.md`, and the seed is in `seed/pw-history-2026.json`.

Section numbers like "§7" refer to `BUILD-PROMPT.md`.

---

## 1. What I checked in the seed before planning

I ran the seed through a small script. It matches the acceptance checks in §9, with one wording point:

| Check | Result |
|---|---|
| Sessions per month | 48 (7 Police slots + 5 MTN slots, × 4 weeks) |
| Davida Adusei twice on a Friday in November | Yes: Week 4, Police Fri 06:00 and Police Fri 16:00. It is the only clash in any of the three months. |
| Comfort Owusua's November load | 6 sessions, the highest. 12 people have 1. |
| November pairs repeating September | **34 of 43** non-couple *sessions* use a pair that also served together in September. Counted as *distinct* pairs, it is 26 of 34. I'll use the per-session count, since that is what the prompt quotes. |
| Names used in schedules but not in `members` | None. 41 members. |

---

## 2. Architecture

One Next.js app on Vercel, talking to one Neon Postgres database. There are no other services.

```
Browser ──► Next.js (App Router, server components + server actions)
              ├─ src/lib/*        pure logic: dates, scheduler, messages, calendar, import (no DB, fully unit-tested)
              ├─ src/db/*         Drizzle schema, queries, seed
              └─ Auth.js          email + password, JWT session, invite-only
                        │
                        ▼
                 Neon Postgres  (HTTP driver for reads, WebSocket Pool for transactions)
```

- **Pure core, thin edges.** Everything that decides something lives in `src/lib` as plain TypeScript that takes data and returns data:
  - which dates a month has
  - what Sanitation Day does to a slot
  - who gets paired
  - what a WhatsApp message says
  - what goes in a calendar file

  Server actions load rows, call those functions, and save the result. That is what makes the scheduler testable and deterministic.
- **Every write is a server action** that checks the role, validates with Zod, writes, adds to `audit_log` where §14 asks, and returns a typed `Result`.
- **Transactions.** These use the WebSocket `Pool`:
  - saving a generated schedule (delete unlocked assignments + insert new ones)
  - applying a swap
  - an import

  Everything else uses the HTTP driver.
- **Public member pages** (`/m/[token]`, `/api/ics/*`, `/api/cal/*`) resolve the token to one member and only ever query that member's sessions.

## 3. Folder structure

```
pw-scheduler/
├─ docs/            PLAN.md · DECISIONS.md · SETUP.md · BUILD-PROMPT.md
├─ seed/            pw-history-2026.json
├─ drizzle/         generated migrations
├─ e2e/             Playwright smoke tests
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/
│  │  ├─ (app)/                 signed-in shell: sidebar on desktop, tab bar on phone
│  │  │  ├─ schedule/[month]/   builder
│  │  │  ├─ sheet/[month]/      sheet editor + live print preview
│  │  │  ├─ members/
│  │  │  ├─ messages/
│  │  │  ├─ locations/
│  │  │  ├─ history/
│  │  │  └─ settings/
│  │  ├─ print/[month]/         bare print route (window.print → PDF)
│  │  ├─ m/[token]/             public member pages (noindex)
│  │  └─ api/ics/ · api/cal/    calendar files
│  ├─ components/
│  │  ├─ ui/                    primitives ported from Budgeteer (button, card, sheet, dialog, badge, tabs…)
│  │  ├─ shell/                 sidebar, tab bar, page header
│  │  └─ schedule/ · sheet/ · members/ · messages/ …
│  ├─ db/                       schema.ts · client.ts · queries/ · seed.ts
│  └─ lib/
│     ├─ dates/                 resolveMonthSessions, week rules, special days, Accra time
│     ├─ scheduler/             engine, scoring, warnings, swap suggestions, PRNG
│     ├─ messages/              templates, rendering, time/name formatting, wa.me links
│     ├─ calendar/              Google link, .ics writer
│     ├─ import/                seed + .xlsx parsing, name normalisation
│     ├─ print/                 layout model shared by preview, /print and .xlsx export
│     └─ auth/ · tokens/ · rate-limit/
└─ *.test.ts next to the code they test (Vitest)
```

## 4. Database schema

As in §5, with these specifics:

- `uuid` primary keys (`gen_random_uuid()`), `created_at` / `updated_at` everywhere, and `archived_at` on members and locations.
- **Enums as Postgres enums:**
  - role
  - title
  - privilege
  - availability_mode
  - schedule status
  - assignment source and status
  - special-day kind and action
  - message kind and status
- **Pair identity.** `assignments.member_ids` stays as `uuid[]`, as §5 asks. Pair history is a **view** that unnests each assignment into sorted `(member_lo, member_hi, month, date, slot_id)` rows, so (A,B) and (B,A) are the same pair. A couple counts as a pair for the history, but is excluded from the repeat penalty.
- **Unique constraints:**
  - `schedules.month`
  - `slots(location_id, key)`
  - `member_availability(member_id, slot_id)`
  - `couples(member_a_id, member_b_id)` with the ids sorted
  - `print_layouts.schedule_id`
  - `members.public_token_hash`
- **Indexes:** `sessions(schedule_id, date)`, a GIN index on `assignments.member_ids`, and `message_log(schedule_id, member_id)`.
- **Member tokens:** 32 random bytes, base64url. Only a **SHA-256 hash** is stored. The raw token is shown once, when the link is created or regenerated, and is copyable from the member panel.
- `settings` is a single row with a fixed id, holding:
  - privilege limits
  - scoring weights
  - week rule
  - 5th week
  - repeat window
  - print defaults
  - congregation name

## 5. Design system — borrowed from Budgeteer

The app takes Budgeteer's **system and micro-interactions**, and the **colours and fonts from §10** of the prompt.

**Taken as they are**
- **Tokens:** `oklch` CSS variables in Tailwind v4 `@theme`, with three surface tiers (page → shell → card), each about 1.5% apart.
- **Cards separated by a hairline border, not shadows**, with a two-step elevation (`--shadow-card`, `--shadow-lift`).
- **Glass:** chrome glass for the phone tab bar and header, and the opaque "panel" glass for sheets, dropdowns and popovers, so text over a dense table stays readable.
- **Inverted panel** for the dark sidebar (`#17201B`) and the single filled primary action per screen.
- **Motion vocabulary:** the `--ease-out` / `--ease-drawer` curves and the following animations, all switched off under `prefers-reduced-motion`.
  - `.lift`: hover lift on clickable cards, such as schedule cells.
  - `.row-hover`
  - `.rise`: staggered entrance.
  - `.cell-in`: grid cells appearing after Generate.
  - `.bar-grow`: the sessions-per-person bars.
  - `.shimmer`: skeletons that match each page's real layout.
  - Sheets that slide up from the bottom on a phone and in from the right on desktop.
  - Dialogs that scale in.
- **Buttons:** pill buttons with a 1px press nudge instead of a scale, and the cva variants (default / outline / bordered / ghost / destructive / link, sizes xs–lg).
- **Interaction patterns:**
  - optimistic updates that roll back with an error toast
  - toasts with **Undo** (lock, clear cell, swap)
  - top-of-page loader on navigation
  - `PageHeader`, `EmptyState` with a call to action, `InfoTip`
  - badges that always carry text, not colour alone
- **UI primitives** (button, card, badge, sheet, dialog, tabs, select, switch, tooltip, popover, dropdown) ported from Budgeteer's `src/components/ui`. They are shadcn/Radix-based, so this satisfies "shadcn/ui".

**Changed for this app**
- **Colours** are the prompt's, mapped onto the same token names:

  | Token | Value |
  |---|---|
  | `--page` | `#F4F5F2` |
  | `--card` | `#FFFFFF` |
  | `--border` | `#DDE1DC` |
  | `--foreground` | `#17201B` |
  | `--muted-foreground` | `#5B6460` |
  | `--inverted` (sidebar) | `#17201B` |
  | `--primary` | green `#1F6F4A` |

  Location accents are Police `#2E8B5F` and MTN `#2F6FC0`. Warning and danger use their background/text pairs. Budgeteer's orange is not used.
- **Fonts:** Inter for the UI and **Space Grotesk** for headings, replacing Plus Jakarta Sans. **Carlito** is used only inside the print layout.
- **Radius:** 12px cards, per the prompt, against Budgeteer's 18px.
- **Navigation:** left sidebar on desktop and a bottom tab bar on phones. Budgeteer uses a top nav.
- **Touch targets:** at least 44px, which is larger than some of Budgeteer's compact controls (`xs` buttons get a 44px hit area through padding).

## 6. Milestones

Each one ends with tests, `pnpm build`, a summary of what changed, and a **commit that you make**. I won't commit or push unless you tell me to.

| # | Milestone | Done when |
|---|---|---|
| 1 | **Foundation.** Next.js + Tailwind v4 + ported UI kit, Neon + Drizzle schema + first migration, Auth.js credentials with the owner created from env, app shell (sidebar / tab bar), `SETUP.md`. | You can sign in with `OWNER_EMAIL` and see the empty shell on desktop and phone. |
| 2 | **Data and seed.** `pnpm db:seed` loads locations, slots, members, couples and the three months as archived, imported schedules. Members screen with editing (privilege, availability, couples, never-pair, private link). Locations & slots screen. | Seed is idempotent. Member edits persist and are audited. |
| 3 | **Dates and special days.** `resolveMonthSessions`, week rule, 5th week, Sanitation Day with all three actions, one-off days, live preview in the rule editor. | Tests for Nov 2026 (starts Sunday), Jul 2026 (starts Wednesday), first-Saturday logic and all actions. **Needs §18 answered first.** |
| 4 | **Scheduler.** Pure engine (hard constraints, weighted soft scoring, most-constrained-first greedy over N seeds, local search), warnings, explanations, top-3 swap suggestions. Builder screen: generate, regenerate unlocked, lock, swap panel, drag-and-drop, publish. | Every hard constraint tested, determinism per seed, no repeats from the seeded history where avoidable, §9 acceptance checks in a test, under 2s for about 50×50. |
| 5 | **Print.** Shared layout model, `/print/[month]` matching your PDF, sheet editor (cell overrides, column/row resize, range copy as TSV + HTML), live A4 preview with overflow warnings, `.xlsx` export. | Side-by-side with your November PDF looks the same. |
| 6 | **Messages.** Templates with placeholders, weekend group message, monthly previews with a "next person" flow, pair reminders, `wa.me` links, message log. | Snapshot test for November Week 2 matches your example's format exactly. |
| 7 | **Calendar and member pages.** Google Calendar links, single `.ics`, subscribe feed, `/m/[token]` pages (sessions, availability, confirm / can't make it → swap request shown in the builder). | ICS passes RFC 5545 basics; public pages expose nothing beyond the member's own sessions. |
| 8 | **History, import and polish.** Pair-history matrix, per-person timeline, month comparison, `.xlsx` import with a review step, invites and users, audit log view, Playwright smoke tests, Vercel deploy. | Smoke tests pass against a preview deploy. |

## 7. Test plan (Vitest unless noted)

- **dates:**
  - both week rules
  - 5th week on and off
  - Nov 2026 and Jul 2026
  - Sanitation Day under each action, including the exact results in §7
  - one-off cancel, change-time and add-session
  - nothing in Accra time drifting to UTC
- **scheduler:**
  - each hard constraint with a failing fixture
  - locked assignments kept and counted
  - same seed gives the same output
  - repeat penalty decays by month
  - no repeat when an alternative exists
  - unfillable sessions produce warnings
  - swap suggestions respect every hard constraint
  - performance budget
- **acceptance (§9):** the Davida clash, Comfort's 6 sessions, and the 34-of-43 repeat figure from the seeded data.
- **messages:**
  - greeting by time of day
  - `6:00 – 8:00 am` formatting with am/pm derived from the 24-hour time
  - titles and couple labels
  - moved and cancelled sessions
  - the November Week 2 snapshot
- **calendar:** Google URL encoding, and ICS line folding, escaping, stable UIDs and timezone.
- **import:** name normalisation, alias matching and the unknown-name queue.
- **e2e (Playwright):** sign in → generate → lock → publish → open print → copy weekend message.

## 8. Decisions I've made already

These are in `DECISIONS.md`, with reasons:

1. **Next.js 16, not 15 (needs your OK).** Your Budgeteer app is on 16 and that is current; Auth.js v5 supports Next 15 and 16. Staying on 15 is also fine — say so.
2. **Auth.js v5 is still a beta** (`5.0.0-beta.32`). It is widely used and is what the prompt asks for, so I'll use it, pinned to an exact version.
3. **SheetJS from the SheetJS CDN, not npm.** The npm `xlsx` package is stuck at 0.18.5 with known security fixes missing. SheetJS publishes current versions on its own CDN, and that is the install their docs give.
4. **Passwords hashed with bcrypt** (`bcryptjs`, pure JS), so there's no native build step on Vercel.
5. **Rate limiting in Postgres** (a small `rate_limits` table), because in-memory limits don't hold across Vercel instances.
6. **Repeat figure counted per session** (34 of 43), not per distinct pair (26 of 34), to match the prompt's number.
7. **Not committing or pushing** unless you ask.

## 9. Questions to answer before milestone 3 (§18), plus three of mine

**About your rota**

1. **Week rule.** Your own examples point to `calendar_week`, not the `nth_weekday` default:
   - §6 shows "Week 1 · 3 – 8 Nov", and the message example says "Week 2 (Fri 13 – Sun 15 Nov)". Both are Mon–Sun weeks.
   - Under `nth_weekday`, Week 1 would include Sun 1 Nov, and Week 2's Sunday would be 8 Nov, before its own Friday.

   Shall I default to `calendar_week`? I recommend it.
2. **Edges of a month under `calendar_week`.** July 2026 starts on a Wednesday, so Week 1's Tuesday is 30 June, and Week 5's weekend is 1–2 August. Should sessions that fall outside the month be **dropped** (my suggestion) or **kept**?
3. **5th week.** When a month has a 5th Friday/Saturday/Sunday, should those sessions be scheduled?
4. **Privilege limits.** The real monthly numbers for publisher, auxiliary pioneer and regular pioneer (2 / 4 / 6 are placeholders). Who is which privilege? Every member in the seed would otherwise start as a publisher.
5. **Pairing exceptions.** When is a mixed pair (Bro + Sis, not a couple) acceptable?
6. **Couples.** Confirm the six couples in the seed. Are Kwabena Adusei Snr & Davida Adusei a couple?
7. **Titles.** Confirm the Bro/Sis guesses. I'll show them as "unconfirmed" in the Members screen until you tick them.
8. **Repeat window.** Is avoiding pairs from the last 3 months right?

**About the build**

9. **Next.js 16 or 15?** I recommend 16.
10. **Colours.** Use the prompt's green palette, as planned above, or Budgeteer's orange-and-near-black look as well?
11. **Neon.** Do you have a Neon project for this already, or shall I write `SETUP.md` for you to create one? Milestone 1 needs `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in `.env.local` before migrations can run.
