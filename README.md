# Daily

Offline-first PWA that makes mobile money cash withdrawal (MTN MoMo, Orange Money) in Cameroon faster.
SvelteKit 3 (static SPA) + Supabase (Postgres/PostGIS). Daily never asks for, sees or stores a PIN.

## Requirements

- Node.js 22.17 or newer
- A Supabase project (Postgres 17)

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:5173 |
| `npm run build` | Static build into `build/` (SPA shell + service worker) |
| `npm run preview` | Serve the production build on http://localhost:4173 |
| `npm run check` | Strict type check (app + service worker) |
| `npm test` | Unit tests and database tests (in-memory Postgres + PostGIS via PGlite, no Docker) |
| `npm run test:e2e` | End-to-end tests of the production build in a real browser against a fake backend (`e2e/`); uses the installed Edge locally |
| `npm run icons` | Redraw the placeholder PWA icons into `static/icons/` (Windows) |
| `npm run db:new -- <name>` | Create a new migration |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `npm run tiles:build` / `tiles:publish` | Build and upload the map tiles (normally run by the "Map tiles" GitHub workflow) |

## Database

Migrations live in `supabase/migrations/`; database tests in `supabase/tests/`.

1. `npx supabase login`, then `npx supabase link --project-ref <your-project-ref>`
2. `npm run db:push`
3. In the dashboard, under **Authentication → Sign In / Providers → Email**: turn **Confirm email** off and set the
   minimum password length to 8.

USSD formats are rows in `ussd_templates` (placeholders `{code}` and `{amount}`), and code formats and amount limits
are columns on `networks`. Edit them in the dashboard to change behaviour without an app release.

## Deploy (Vercel)

`vercel.json` builds with `npm run build`, serves `build/`, rewrites every route to the SPA shell and sets security
and caching headers.
