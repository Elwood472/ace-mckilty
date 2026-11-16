# Ace McKilty Gift Registry

Wish lists with secret purchases. Built with Next.js (App Router), TypeScript, and Postgres (`pg` when `DATABASE_URL` is set; **file-backed PGlite** locally when unset).

## Local development

```bash
cd gift-registry
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### How local data persists

When `DATABASE_URL` is unset, the app stores Postgres data in **`.data/pglite/`** (file-backed PGlite). Accounts, lists, and gifts **survive `npm run dev` restarts**.

- Do **not** delete `.data/` while testing — that wipes all local accounts.
- `.data/` is gitignored; it is only for this machine / cloud agent workspace.
- Schema migrations under `migrations/` apply once and are recorded in `schema_migrations`; they do not reset user rows.
- Optional demo/seed scripts may add sample users; they must never truncate existing accounts on boot (this app does not auto-reset users).

With `DATABASE_URL` set (hosted Postgres), persistence is the remote database instead.

## Stack notes

- `cursor-app.json` declares `{ "database": "postgres" }` for Cursor hosting
- `npm run build` runs `next build` then `scripts/migrate.mjs` (no seed dump in the repo)
- No HTTP data-import path; CLI-only dump tools remain under `scripts/` for operators
- App-owned email/password auth (httpOnly session cookies, CSRF tokens on mutations)
- Wish-list owners never receive purchase status in API/UI responses
