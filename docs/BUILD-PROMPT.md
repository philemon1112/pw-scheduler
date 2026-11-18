# Build prompt: PW Scheduler (public witnessing rota app)

> Paste everything below into Claude Code from an empty project folder.
> Put `pw-history-2026.json` in `seed/` first. It holds my July, September and November 2026 schedules.

---

## 0. How I want you to work

1. **Read this whole prompt first, then write a plan** in `docs/PLAN.md`: architecture, folder structure, database schema, and the milestones in section 16. Stop and show me the plan before writing app code.
2. **Ask before you guess.** Section 18 lists the open questions. Confirm them with me at the start. For anything else that's unclear, pick the simplest option, write it in `docs/DECISIONS.md`, and keep going.
3. Build **one milestone at a time**. At the end of each one: run the tests, run `pnpm build`, show me what changed, and commit with a clear message.
4. Write **unit tests for all scheduling, date and message logic** (section 16 lists what they must cover). The UI can be tested more lightly.
5. Keep it simple. This is a hobby project for one congregation, so no microservices, queues or over-abstraction. Server actions and route handlers are enough.
6. Use TypeScript strict mode, with no `any` in domain code.

---

## 1. The problem

I organise **public witnessing** (cart witnessing) for **Westlands English Congregation** in Accra, Ghana. Every month I:

1. Build a schedule in Excel. Two locations have fixed weekly time slots, and each slot gets **two people** (a pair).
2. Copy it into Word, convert it to PDF, and share it.
3. Before the month starts, send each person a **private preview** of their sessions so they can ask for changes.
4. **Every Thursday**, send the WhatsApp group a message listing **Friday to Sunday's** sessions at both locations.

Problems with the current way:
- I keep copying last month's sheet, so **the same pairs repeat**. In November, 34 of 43 non-couple pairs were also together in September. People complain.
- **Uneven load.** In November, one person had 6 sessions while 12 people had 1.
- **Clashes.** Someone was booked twice on the same Friday.
- People have **different availability**, and some have no fixed days.
- Names are spelled inconsistently, and times have typos such as "9:30 – 11:30 pm" when it means am.
- There are **special days**. The first Saturday of every month is **National Sanitation Day** (explained in section 7).
- I have to use Excel, Word, PDF and WhatsApp separately. **I want everything in one app.**

---

## 2. Users and access

- **Owner:** me. Full access.
- **Editor:** someone I invite to help or to cover a month for me. Can do everything except manage users and settings.
- **Viewer:** optional, read-only.
- There's **no public sign-up**. Accounts exist only by invite from the owner.
- **Members** (the people being scheduled) **don't have accounts.** They only get private links with a token (section 13): their availability form, confirming or declining sessions, and calendar files.

---

## 3. Tech stack (use exactly this unless you ask me first)

| Area | Choice |
|---|---|
| Framework | **Next.js 15 (App Router)**, React 19, TypeScript strict |
| Styling | **Tailwind CSS v4** + **shadcn/ui** |
| Database | **Neon Postgres** (serverless) |
| ORM / migrations | **Drizzle ORM** + **drizzle-kit** using the `@neondatabase/serverless` driver |
| Auth | **Auth.js v5** (next-auth@5) with **email + password** (credentials provider, password hashed with argon2 or bcrypt), JWT sessions, invite-only |
| Validation | **Zod** for every form, server action and route handler input |
| Dates | **date-fns** + **@date-fns/tz**. All schedule logic runs in **Africa/Accra** |
| Excel | **SheetJS (xlsx)** to import old schedules and export to .xlsx |
| Tests | **Vitest** for unit tests, **Playwright** for a few end-to-end smoke tests |
| Package manager | **pnpm** |
| Hosting | **Vercel** (free tier) |

**Neon specifics:**
- Use the **pooled** connection string as `DATABASE_URL` for the app, and the **direct (unpooled)** string as `DATABASE_URL_UNPOOLED` for `drizzle-kit migrate`.
- Use the Neon HTTP driver (`drizzle-orm/neon-http`) for simple queries. Use the WebSocket `Pool` (`drizzle-orm/neon-serverless`) where transactions are needed: saving a generated schedule, applying swaps, and imports.
- Write `docs/SETUP.md`: create a Neon project, a `dev` branch for local work and `main` for production, where to put each env var locally and in Vercel, and how to run migrations and the seed.
- Provide `.env.example` with: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `APP_URL`, `OWNER_EMAIL`, `OWNER_INITIAL_PASSWORD`.

---

## 4. Glossary

- **Location:** a witnessing spot, e.g. "Police Station – Westlands".
- **Slot:** a recurring weekly time at a location, e.g. Police Station, Friday, 06:00–08:00. Each slot needs **2 people**.
- **Session:** one slot on one real date, e.g. Fri 6 Nov 2026, 06:00–08:00, Police Station.
- **Assignment:** the people placed in a session. This is normally a **pair**, or a **couple** counted as one pair.
- **Schedule:** all sessions for one month. Status is `draft` → `published` → `archived`.
- **Privilege:** `publisher`, `auxiliary_pioneer` or `regular_pioneer`. It sets each person's monthly session limit, since pioneers get more sessions.
- **Special day:** a date rule that turns slots off or moves their times.

---

## 5. Data model (Drizzle schema, Postgres)

Use `uuid` primary keys (`gen_random_uuid()`), `created_at` and `updated_at` on every table, and soft delete (`archived_at`) for members and locations. Add sensible indexes and unique constraints.

- **users**: id, email (unique), name, password_hash, role (`owner|editor|viewer`), invited_by, last_login_at.
- **settings** (single row): congregation_name, timezone (default `Africa/Accra`), repeat_window_months (default 3), privilege_limits jsonb (default `{publisher:2, auxiliary_pioneer:4, regular_pioneer:6}`, which are placeholders I'll change), week_rule (section 6), include_fifth_week (bool), pairing_rule (`same_gender_or_couple` by default), message templates (or a separate table), print defaults.
- **members**: id, title (`Bro|Sis`), first_name, last_name, display_name (e.g. "Julia Eshun"), aliases text[] (for matching misspellings when importing), gender (`M|F`, taken from the title), phone_e164 (Ghana numbers normalised to `+233…`), privilege, max_sessions_override (nullable), availability_mode (`specific|flexible|ask_monthly`), preferred_location_id (nullable), notes, active, paused_until (nullable), public_token (random, revocable), title_confirmed (bool).
- **couples**: id, member_a_id, member_b_id, display_label (e.g. "Bro & Sis Agbanawo"), always_together (bool, default true).
- **member_availability**: member_id, slot_id (unique pair). Used when availability_mode is `specific`.
- **member_unavailable_dates**: member_id, start_date, end_date, reason.
- **pair_rules**: member_a_id, member_b_id, rule (`never|prefer`). For people who shouldn't be paired, or should be paired more often.
- **locations**: id, key, name, message_name (used in "the location near the …"), pdf_title, pdf_color, sort_order, active.
- **slots**: id, location_id, key, weekday (`MON…SUN`), start_time, end_time, people_needed (default 2), pdf_day_label, pdf_time_label, sort_order, active.
- **special_day_rules**: id, name, kind (`recurring|one_off`), recurrence (e.g. `{type:"nth_weekday", n:1, weekday:"SAT"}`), date (for one_off), location_ids (null means all), action (section 7), cutoff_time, new_start_time, note_for_messages, note_for_pdf, active.
- **schedules**: id, month (`YYYY-MM`, unique), status, generated_seed, generated_at, published_at, notes.
- **sessions**: id, schedule_id, slot_id, date, start_time, end_time (after special-day adjustments), week_index, is_cancelled, special_day_rule_id, note.
- **assignments**: id, session_id, member_ids uuid[] (length 2, or a couple), couple_id (nullable), locked (bool, so manual choices survive regeneration), source (`generated|manual|imported`), status (`pending|confirmed|declined|swapped`).
- **swap_requests**: id, assignment_id, member_id, reason, status, suggested_member_ids, resolved_by, resolved_at.
- **message_templates**: id, kind (`weekend_group|monthly_preview|pair_reminder|swap_offer`), body (with placeholders), updated_by.
- **message_log**: id, kind, member_id (nullable), schedule_id, week_start, rendered_text, sent_at, status (`sent|change_requested`). The status is marked manually in the UI.
- **print_layouts**: schedule_id (unique), column_widths jsonb, row_heights jsonb, cell_overrides jsonb, orientation (`landscape|portrait`), margins (`normal|narrow`), fit_to_width (bool), font_size.
- **audit_log**: user_id, action, entity, entity_id, diff jsonb, created_at.
- **import_batches**: id, source_filename, month, raw jsonb, created_by. Used for traceability of old schedules.

**Pair history** is a SQL view (or derived query) over imported and published assignments: `(member_x, member_y, month, date, slot)`. Always store the pair with ids sorted so (A,B) and (B,A) count as the same pair.

---

## 6. Dates and weeks

- My sheets label rows **Week 1–4**. In the app, every session has a **real date**, and the UI shows "Week 1 · 3 – 8 Nov".
- **How "Week n" maps to dates** must be a **setting**, `week_rule`, with two options:
  - `nth_weekday` (default for now): Week n uses the n-th Tuesday, n-th Friday, n-th Saturday and n-th Sunday of the month.
  - `calendar_week`: Week n is the n-th Monday–Sunday week whose Friday falls in the month.
- **5th week:** some months have a 5th Friday, Saturday or Sunday. With `include_fifth_week = true`, create those sessions as Week 5. Otherwise skip them.
- Use one helper for all of this, `resolveMonthSessions(month, slots, rules, settings)`, with thorough unit tests. Include November 2026, which starts on a Sunday, and July 2026, which starts on a Wednesday.

---

## 7. Special days (important)

**National Sanitation Day** is a default recurring rule, on by default:
- It falls on the **first Saturday of every month**, at **all locations**.
- The exercise **ends at 10:00 am**. So on that Saturday:
  - Any slot that **ends at or before 10:00** is **turned off** (no session, shown greyed as "No session – National Sanitation Day").
  - Any slot that **starts before 10:00 but ends after it** is **moved to start at 10:00**, keeping its length. For example, 9:30–11:30 becomes 10:00 am–12:00 pm.
  - Slots starting at 10:00 or later are unchanged.
- Result for my slots: Police 6:30–8:30 is off, and Police 9:30–11:30 becomes 10:00–12:00. MTN 6:00–8:00 is off, and MTN 9:30–11:30 becomes 10:00–12:00.
- The rule must be editable. The `action` options are:
  - `off_before_cutoff_shift_overlap` (the default above)
  - `shift_all_to_cutoff`
  - `cancel_matching_slots`
- Show a live preview on the rule editor ("Result for Sat 7 Nov 2026").

**One-off special days** (for example an assembly or convention weekend). Pick a date or range and which locations it applies to, then one action:
- `cancel` (all, or chosen slots)
- `change_time` (with new times)
- `add_session` (an extra one-time slot)

Each also gets a note to show in messages and the PDF.

The generator, messages, Sheet, PDF and calendar files **all** read the adjusted sessions. No screen may show an original time for a moved or cancelled session.

---

## 8. Scheduling engine (the core)

Write it as pure TypeScript in `src/lib/scheduler/`, with no database access inside, so it's easy to test. Input: month, sessions (already adjusted for special days), members, couples, availability, unavailable dates, pair rules, pair history, settings, locked assignments, and a seed. Output: assignments, a score breakdown, and warnings.

**Hard constraints (never break):**
1. A person is only placed in a session they're available for:
   - `specific`: only their ticked slots.
   - `flexible`: any slot.
   - `ask_monthly`: never auto-placed unless they've confirmed availability for that month.
   - Never on their unavailable dates, never while paused, never if inactive.
2. **At most one session per person per day**, across all locations.
3. Each person's total for the month is at most their **limit** (`max_sessions_override`, otherwise the privilege limit).
4. **Pairing rule**: by default Bro with Bro and Sis with Sis, **or** a couple together. A couple fills a session as one unit. The rule can be relaxed for one session or one member ("allow mixed pair here") because sometimes it's flexible.
5. `pair_rules.never` pairs are never placed together.
6. **Locked** assignments are kept exactly as they are and count toward every limit.

**Soft constraints (score penalties; weights live in a config object so I can tune them):**
- **Repeat pair** from previous months: a high penalty that decays with age. Example: last month 100, two months ago 60, three months ago 30, older 0, using `repeat_window_months`.
- **Same pair twice in this month:** a very high penalty (150).
- **Fairness:** penalise the spread of `sessions / limit` across people (squared deviation from the average), so load is shared fairly within each privilege.
- **Spread across the month:** penalise someone serving in consecutive weeks or twice in the same week, when an alternative exists.
- **Same slot every week:** a small penalty, so people get variety.
- **Preferred location:** a small bonus for matching it.
- Prefer **filling every session**. An unfilled session is a very large penalty and produces a warning.

**Algorithm:**
1. Build the candidates for every session after applying the hard constraints.
2. Order sessions from **most constrained first** (fewest candidate pairs).
3. Use a greedy pass: choose the best-scoring valid pair for each session, breaking ties with a seeded PRNG.
4. Repeat for N iterations (default 300) with different seeds and keep the best total score.
5. Finish with a **local-search** pass that tries swaps of one person between two sessions and keeps any improvement.
6. It must be **deterministic** for a given seed, and finish in under 2 seconds for about 50 sessions and 50 members.

**Explanations:** every assignment stores a short reason ("not paired since Jul · 2 of 4 sessions used").
**Swap suggestions:** a function that returns the top 3 replacements for one person in one session, each with a reason. The UI uses it in the swap panel.

**Warnings to return:**
- A session that couldn't be filled
- A person over their limit (only possible because of locks)
- A repeat from last month that couldn't be avoided
- Someone with a `specific` availability who wasn't used at all
- A member whose title isn't confirmed

---

## 9. Old schedules and history

- **Seed:** `pnpm db:seed` loads `seed/pw-history-2026.json`. It contains the locations and slots with their exact PDF labels, members, couples, and my **July, September and November 2026** schedules as week + slot + two names. Import them as **archived schedules** with `source = imported`, resolving dates with the week rule. They become the pair history for the no-repeat logic.
- **Name normalisation:**
  - Trim whitespace.
  - Remove trailing full stops.
  - Collapse spaces.
  - Match case-insensitively against `display_name` and `aliases`. The seed already merges "Henry Atsu Dameh" into "Henry Atsu Damey".
  - Unknown names go to an **import review** screen, where I can match them to an existing member or create a new one.
- **Excel import:** upload an .xlsx laid out like my current sheet:
  1. A coloured location title row
  2. A day row with merged cells
  3. A time row starting with "WEEK"
  4. Week rows, with two names per cell separated by a line break

  Parse it with SheetJS and show a preview grid before saving. Store the raw data in `import_batches`.
- **History screen:**
  - A pair-history matrix: who has served with whom and when, searchable.
  - A per-person timeline.
  - A month comparison showing "x of y pairs repeated from last month".
- **Acceptance check:** after seeding, the analysis must report that **Davida Adusei is booked twice on Fri (Week 4) in November**, that **Comfort Owusua has 6 sessions in November**, and that **most November pairs repeat September** (34 of the 43 pairs that aren't couples). Put these checks in a test.

---

## 10. Screens

Use a **left sidebar**, with a bottom tab bar on mobile. It must work well on my phone. Order:

1. **Schedule builder**
   - Month picker (‹ November 2026 ›) and status badge.
   - Buttons: Generate, Regenerate unlocked, Publish, Sheet & print, Messages.
   - Rule chips summarising the active rules, plus a banner for any special day this month.
   - Three summary cards: repeated pairs, clashes, load spread.
   - One table per location: rows are weeks with dates, columns are slots. Each cell shows the two names and badges (Repeat, Same day, Couple, Locked, Sanitation Day / moved time), and is greyed if cancelled.
   - Clicking a cell opens a side panel with the two people, a lock toggle, "Allow mixed pair", the top 3 swap suggestions, and a clear button.
   - Also allow drag-and-drop swapping between cells.
   - "Sessions per person" bar list, compared with each person's limit.
2. **Sheet & print** (Excel-like editor plus live print preview, details in section 11).
3. **Members**
   - Searchable list: name, title, privilege, locations, sessions this month, partners this month, availability mode.
   - Edit panel:
     - Title (Bro/Sis)
     - Privilege, which fills in the limit, with an override
     - WhatsApp number
     - Availability mode (specific / flexible / ask me monthly); for `specific`, a grouped checklist of slots
     - Unavailable dates
     - Fixed partner / couple
     - Never-pair list
     - Notes
     - Pause
     - Copy their private link
   - A strip showing the privilege limits, with a "Change limits" button.
4. **Messages** (section 12). Three tabs:
   - **This weekend:** the group message, plus a pair-by-pair "Send to X / Send to Y" list.
   - **Monthly previews:** a list of everyone with Sent / Not sent / Change requested status. Shows each person's message and calendar links, with an Open WhatsApp button.
   - **Wording:** template editor with placeholder chips.
5. **Locations & slots**: a card per location with an editable slot table (day, start, end, PDF labels, active), and the **Special days** section from section 7.
6. **History** (section 9).
7. **Settings**: congregation name, week rule, 5th week, repeat window, privilege limits, scoring weights (advanced), users and invites (owner only), and export everything as JSON or .xlsx.

**Public member pages** (no login, token in the URL, `noindex`):
- `/m/[token]`: their upcoming sessions, with Add to Google Calendar, a .ics download and a subscribe link.
- `/m/[token]/availability`: tick slots, set the availability mode, add away dates, and confirm next month's availability.
- `/m/[token]/session/[id]`: Confirm or "I can't make it" with an optional reason. This creates a `swap_request` that I approve in the app.

**Look and feel**, based on the mockups:
- Font: **Inter** for the UI, **Space Grotesk** for headings.
- Colours:
  - Background `#F4F5F2`, cards `#FFFFFF` with a `#DDE1DC` border and 12px radius
  - Text `#17201B`, muted text `#5B6460`
  - Sidebar `#17201B`
  - Accent green `#1F6F4A`
  - Police Station accent green `#2E8B5F`, MTN accent blue `#2F6FC0`
  - Warning amber: background `#FFF6E5`, text `#7A4200`
  - Danger: background `#FDECEA`, text `#8E2318`
- Touch targets of at least 44px, real labels on every input, and WCAG AA contrast.

---

## 11. Sheet & print preview, and the PDF

**The PDF must look like my current one.** This is a hard requirement.
- A4 **landscape**.
- Title centred, bold, navy `#1F3864`: "WESTLANDS ENGLISH CONGREGATION".
- Subtitle bold, blue `#2E75B6`: "PUBLIC WITNESSING SCHEDULE – NOVEMBER 2026".
- One table per location:
  1. A full-width title bar: Police Station in green `#B4E0A3` with "POLICE STATION - (Tuesday, Friday, Saturday & Sunday)"; MTN in light blue `#C9E9F8` with "NEAR MTN OFFICE — (Friday, Saturday & Sunday)".
  2. A day row with merged headers (Tuesday | FRIDAY ×3 | SATURDAY ×2 | SUNDAY).
  3. A bold time row starting with "WEEK".
  4. Rows "Week 1"–"Week 4", with the date range in small text under each label.
- Cells hold two names on two lines, centred, with thin grey borders.
- Font: **Carlito** (free and matches Calibri), falling back to Calibri.
- Sanitation Day cells: the turned-off cell is grey and italic, "No session / National Sanitation Day", and the moved cell shows "* 10:00 am – 12:00 pm". Add a footnote line explaining it.
- Footer: "Updated <date>".

**Sheet editor (Excel-like):**
- A grid with column letters (A–H) and row numbers, the same structure as the PDF.
- Every cell is editable. Edits are saved as `print_layouts.cell_overrides` so they **don't** change the real assignments. Show a small dot on overridden cells and a "Reset cell" option.
- **Resize columns and rows** by dragging the header edges, and show the column width in the header. Widths and heights are saved per month.
- **Select a range** by click, Shift-click or drag. **Copy** with Ctrl/Cmd+C (handle the `copy` event) or a "Copy cells" button. Write **both** `text/plain` as tab-separated values (quote cells that contain line breaks) **and** `text/html` as a `<table>`, so pasting works in Excel, Google Sheets and Word.
- **Live print preview** below the grid: an A4 page scaled to fit, with landscape/portrait, normal/narrow margins, and "Shrink to fit page width". It warns if the table is too wide or spills onto a second page.

**Generating the PDF:**
- One React component renders the print layout for both the preview and a dedicated route, `/print/[month]`, styled with `@page { size: A4 landscape; margin: … }`.
- "Download PDF" opens `/print/[month]` and calls `window.print()`, so the browser saves it as PDF. This is reliable and costs nothing.
- Use `print-color-adjust: exact` so the coloured bars print.
- Also offer **"Export .xlsx"** with the same layout (merged cells, colours, widths) using SheetJS.
- Note in DECISIONS.md: a later option is server-side PDF with `@sparticuz/chromium` + `puppeteer-core` on Vercel, but not now.

---

## 12. Messages

**General rules:**
- Templates use placeholders: `{greeting}`, `{name}`, `{title}`, `{month}`, `{my_sessions}`, `{partner}`, `{date}`, `{day}`, `{time}`, `{location}`, `{calendar_link}`, `{availability_link}`, `{weekend_blocks}`.
- Use WhatsApp formatting: `*bold*`.
- Times look like `6:00 – 8:00 am`: en dash with spaces, lowercase am/pm, and **am/pm derived from the 24-hour time, never typed**.
- Names in messages use the title: "Bro Philemon Abakah", "Sis Julia Eshun". Couples use their label: "Bro & Sis Agbanawo".
- Greeting by time of day: Good Morning before 12:00, Good Afternoon until 17:00, Good Evening after that.

**1) Weekend group message (my Thursday message).** Generate it for the Friday–Sunday ahead. Group by location, then by day; days with no sessions are left out. Moved sessions show the new time, and turned-off sessions are left out with the special-day note added. It must reproduce this format exactly (my real example, with the am/pm typo fixed):

```
Good Afternoon @all
Please find below the public witnessing schedule from *Friday to Sunday* at the location near the *Haatso - near MTN office*.

*Friday*
*Time:* 6:00 – 8:00 am
*Partners:* Bro Philemon Abakah & Bro Henry Atsu Damey

*Saturday*
*Time:* 6:00 – 8:00 am
*Partners:* Sis Julia Eshun & Sis Comfort Owusua

*Time:* 9:30 – 11:30 am
*Partners:* Bro Arnold Boateng & Bro Philip Abakah

*Sunday*
*Time:* 6:30 – 8:30 am
*Partners:* Bro Philip Abakah & Bro Kofi Adusei

*Time:* 9:30 – 11:30 am
*Partners:* Bro Elvis Ampomah-Tabi & Bro Jerome Masamaka

Kindly indicate your availability for any of the sessions here or via direct message. Kindly communicate if you would like to be rescheduled.
Thank you

Also, find below the public witnessing schedule from *Friday to Sunday* at the location near the *Police Station – Westlands*.

*Friday*
*Time:* 6:00 – 8:00 am
*Partners:* Sis Davida Adusei & Sis Lydia Mensah
...
```

Buttons: **Copy** (to the clipboard) and **Share to WhatsApp**, which opens `https://wa.me/?text=<encoded>` so I can choose the group. Links can't target a group directly, so that's fine. Also offer a weekend picker (‹ ›) and "Edit before copying".

**2) Monthly preview (one per person, sent before the month).** My wording:

```
Please this is the schedule for the Public Witnessing for {month}. You are booked for:
• Sat 7 Nov · 6:30 – 8:30 am with Sis Beauty Odjo – Police Station
• ...
Add to your calendar: {calendar_link}
Kindly let me know if it works for you. Thanks
```

Each person has an "Open WhatsApp" button using `https://wa.me/<phone digits>?text=<encoded>`. If there's no phone number, show "Add number" instead. A "Next person" flow lets me send them all quickly. Mark each one Sent / Change requested in `message_log`.

**3) Pair reminder:** one message for both partners of a session ("You and Bro X are on Saturday 6:00 – 8:00 am at …"), with send buttons for each partner.

My example was typed by hand, so a few names and their order differ from the PDF. Write a snapshot test that renders the message for **November Week 2 (Fri 13 – Sun 15 Nov)** from the seed data. It must match the example's format exactly: line breaks, asterisks, en dashes, lowercase am/pm, the blank line between sessions, and the closing lines. The names come from the data, in their stored order.

---

## 13. Calendar

- **Google Calendar link** for each assignment: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=<Public witnessing – Location>&dates=<YYYYMMDDTHHmmss>/<YYYYMMDDTHHmmss>&ctz=Africa/Accra&details=<partner + note>&location=<location>`.
- **.ics download** for one session: `/api/ics/[assignmentId]?t=<member token>`.
- **Subscribe feed** for each member: `/api/cal/[token].ics`. It lists all their upcoming sessions, so new months appear automatically in Google, Apple or Outlook. Use stable UIDs and include `VTIMEZONE` or UTC times.
- Write the ICS by hand or with the small `ics` package. Validate the output against RFC 5545 basics in a test.

---

## 14. Security and privacy

- Every app route requires login, except `/login`, `/m/[token]/*`, `/api/ics/*` and `/api/cal/*`.
- Member tokens are at least 32 random bytes in base64url, stored hashed if practical, and can be revoked and regenerated from the member page.
- Public pages show only that member's own sessions and their partner's display name. No phone numbers, no other members.
- Rate-limit public routes and the login route (a simple in-memory limit or a Postgres-backed limiter is enough).
- Role checks happen in **server actions**, not only in the UI. Write to `audit_log` on publish, swaps, imports and member edits.
- Phone numbers are visible only to logged-in users. Never log full message bodies with phone numbers to the console.
- Add `robots` `noindex` on public pages and a basic Content Security Policy.

---

## 15. Non-functional

- Mobile first. The Schedule and Messages screens must be comfortable on a phone.
- Fast: generating a month takes under 2 s, and pages load from cached server components.
- Accessibility: keyboard reachable, visible focus, labelled inputs, and colour is never the only signal (badges have text).
- Code organisation:
  - `src/app` for routes
  - `src/lib/scheduler`, `src/lib/dates`, `src/lib/messages`, `src/lib/calendar`, `src/lib/import` for pure logic with tests
  - `src/db` for schema, queries and seed
  - `src/components`
- Errors: friendly toast messages, and server actions return typed results.

---

## 16. Milestones (build in this order, commit after each)

1. **Foundation:** Next.js + Tailwind + shadcn setup, Neon + Drizzle schema + migrations, Auth.js with the owner account created from env, app shell with sidebar, SETUP.md.
2. **Data and seed:** locations, slots, members, couples, settings. Seed from `seed/pw-history-2026.json` with history imported. Members screen with editing (privilege, availability, couples, never-pair). Locations & slots screen.
3. **Dates and special days:** `resolveMonthSessions`, the week rule setting, 5th week, and the Sanitation Day rule plus one-off special days, with the live preview. *Tests:* Nov 2026, Jul 2026, first-Saturday logic and all three actions.
4. **Scheduler:** the engine, warnings and swap suggestions. Schedule builder screen with generate, lock, swap, drag and drop, and publish. *Tests:* every hard constraint, repeat avoidance against the seeded history, determinism with a seed, and the acceptance checks in section 9.
5. **Print:** the PDF layout matching section 11, the `/print/[month]` route, the Sheet editor (resize, edit overrides, range copy), the live preview, and .xlsx export.
6. **Messages:** templates, weekend group message, monthly previews, pair reminders, WhatsApp links and message log. *Test:* exact match with the example.
7. **Calendar and member pages:** Google links, .ics, subscribe feed, and the token pages for availability and confirm/decline, with swap requests appearing in the builder.
8. **History, import and polish:** History screen, Excel import with the review step, users and invites, audit log, Playwright smoke tests, and deploy to Vercel.

---

## 17. Out of scope for now

- Native mobile apps.
- WhatsApp Business API or automatic sending. I'll always tap Send myself, through `wa.me` links and copy/paste.
- SMS, payments, or multiple congregations (but keep a `congregation`/settings row so this could be added later).

---

## 18. Questions to confirm with me before milestone 3

1. **Week rule:** is "Week 1" the first Tuesday, Friday, Saturday and Sunday of the month (`nth_weekday`), or the first Mon–Sun week (`calendar_week`)?
2. **5th week:** when a month has a 5th Friday, Saturday or Sunday, should those sessions be scheduled?
3. **Privilege limits:** the real monthly numbers for publisher, auxiliary pioneer and regular pioneer. 2/4/6 are placeholders.
4. **Pairing exceptions:** when is a mixed pair (Bro + Sis, not a couple) acceptable?
5. **Couples:** confirm which pairs in the seed are couples, especially Kwabena Adusei Snr & Davida Adusei.
6. **Titles:** confirm the Bro/Sis guesses in the seed (they're marked `titleConfirmed: false`).
7. **Repeat window:** is avoiding pairs from the last 3 months right?
