# Gift Registry

Family wish lists with secret purchases. Built with Next.js (App Router), TypeScript, and Postgres (`pg` in production, PGlite locally when `DATABASE_URL` is unset).

## Local development

```bash
cd gift-registry
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Local runs use in-memory PGlite (migrations applied on first query).

## Stack notes

- `cursor-app.json` declares `{ "database": "postgres" }` for Cursor hosting
- `npm run build` runs `next build` then `scripts/migrate.mjs`
- App-owned email/password auth (httpOnly session cookies, CSRF tokens on mutations)
- Wish-list owners never receive purchase status in API/UI responses
