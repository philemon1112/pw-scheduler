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
| `AUTH_SECRET` | output of `openssl rand -base64 32` |
| `APP_URL` | `http://localhost:3000` |
| `OWNER_EMAIL` | your email |
| `OWNER_INITIAL_PASSWORD` | at least 10 characters |

## 4. Migrate, seed, run

```bash
pnpm db:migrate   # creates the tables on the dev branch
pnpm db:seed      # locations, slots, members, couples and Jul/Sep/Nov 2026 (milestone 2)
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

4. Deploy, then sign in once with the owner email and password to create the owner on production.

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
| `pnpm test` | Unit tests (Vitest) |
| `pnpm typecheck` / `pnpm lint` | TypeScript and ESLint |
| `pnpm db:studio` | Browse the database |
