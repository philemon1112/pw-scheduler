# Setup

## 1. Install

```bash
pnpm install
cp .env.example .env.local
```

Node 20.9 or newer. pnpm 9.

## 2. Create the Neon database

1. Sign in at [console.neon.tech](https://console.neon.tech) and create a project (any name; region close to Ghana, e.g. **AWS eu-central-1**).
2. Neon creates a `main` branch. That is **production**.
3. Create a second branch from it called **`dev`**. That is for local work, so experiments never touch the real rota.
4. On the `dev` branch, open **Connect**:
   - **Pooled connection** (the host contains `-pooler`) → `DATABASE_URL`
   - **Direct connection** (toggle "Connection pooling" off) → `DATABASE_URL_UNPOOLED`

   The app uses the pooled string. Migrations use the direct one, because the pooler can't hold the session a migration needs.

## 3. Fill in `.env.local`

| Variable | Value |
|---|---|
| `DATABASE_URL` | `dev` branch, pooled |
| `DATABASE_URL_UNPOOLED` | `dev` branch, direct |
| `AUTH_SECRET` | output of `openssl rand -base64 32`. It also unlocks members' private links (D26): keep the same value for good, or every link has to be made again |
| `APP_URL` | `http://localhost:3000` |
| `OWNER_EMAIL` | your email |
| `OWNER_INITIAL_PASSWORD` | at least 10 characters |

## 4. Migrate, seed, run

```bash
pnpm db:migrate   # creates the tables on the dev branch
pnpm db:seed      # locations, slots, members, couples, Sanitation Day, and Jul/Sep/Nov 2026 as history
pnpm dev
```

Open http://localhost:3000 and sign in with `OWNER_EMAIL` and `OWNER_INITIAL_PASSWORD`. That first sign-in creates the owner account. After that the two env values do nothing, so changing your password in the app is final.

## Trying it without Neon (optional)

`pnpm db:local` runs a real Postgres from the project itself (PGlite, Postgres compiled to WebAssembly), with nothing to install. It keeps its data in `.local-db/`, applies the migrations on start, and listens on port 54329.

```bash
pnpm db:local                       # terminal 1 — leave it running
```

In `.env.local`, point the app at it instead of Neon:

```
DATABASE_URL="postgres://postgres@localhost:54329/postgres"
```

Then in a second terminal:

```bash
pnpm db:seed
pnpm dev
```

The app talks to a `localhost` URL with node-postgres; anything else goes through Neon's drivers. Delete `.local-db/` to start again from empty. Neon is still what runs in production.

## 5. Production on Vercel

1. Import the repository into Vercel.
2. In **Settings → Environment Variables**, add the same six variables for **Production**, using the **`main`** branch's connection strings and `APP_URL` set to your Vercel URL.
3. Run the migrations against production once from your machine, before the first deploy that needs them:

   ```bash
   DATABASE_URL_UNPOOLED="<main branch, direct>" pnpm db:migrate
   ```

4. Seed production once, the same way (it only adds, so running it again is safe):

   ```bash
   DATABASE_URL="<main branch, pooled>" DATABASE_URL_UNPOOLED="<main branch, direct>" pnpm exec tsx src/db/seed.ts
   ```

5. Deploy, then sign in once with the owner email and password to create the owner on production, and change the password in **Settings → Your account**.

`APP_URL` must be the address people will actually open (for example `https://pw-scheduler.vercel.app`, or your own domain), because it is written into members' private links, calendar feeds and invite links.

## 6. Before the first real month

1. **Members:** confirm each Bro/Sis title ("Confirm all" once they're right), set privileges or each person's own limit, and add WhatsApp numbers.
2. **Members → Change limits:** the real monthly numbers for publisher, auxiliary pioneer and regular pioneer (2/4/6 are placeholders).
3. **Locations:** check the slots and Sanitation Day.
4. **Schedule:** Generate, look at the warnings, lock anything you want to keep, Regenerate unlocked, then Publish.
5. **Sheet & print:** Download PDF.
6. **Messages:** "Make their links" on Monthly previews, then send each person their preview; the weekend message on Thursdays.
7. **Settings → Users and invites:** invite anyone who helps you.

## Smoke tests (Playwright)

They run against a running app with the installed Google Chrome — no browser download. With the local database seeded and a production build running:

```bash
pnpm db:local                                   # terminal 1
pnpm db:seed && pnpm build && pnpm start -p 3124 # terminal 2, with .env.local pointing at the local db
pnpm test:e2e                                   # terminal 3
```

`E2E_BASE_URL`, `E2E_EMAIL`, `E2E_PASSWORD` and `E2E_MONTH` (default `2027-03`) point them elsewhere, for example at a Vercel preview with a test account.

## Changing the schema

Edit `src/db/schema.ts`, then:

```bash
pnpm db:generate   # writes a new SQL file in drizzle/
pnpm db:migrate    # applies it to whichever branch DATABASE_URL_UNPOOLED points at
```

Commit the generated SQL with the schema change.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Local server |
| `pnpm build` | Production build |
| `pnpm test` | Unit and database tests (Vitest) |
| `pnpm test:e2e` | Smoke tests against a running app (Playwright) |
| `pnpm db:local` | A local Postgres with nothing to install |
| `pnpm db:seed` | Load the seed file (safe to repeat) |
| `pnpm typecheck` / `pnpm lint` | TypeScript and ESLint |
| `pnpm db:studio` | Browse the database |
