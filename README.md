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

The Donations tab's numbers and transfer codes are in `src/lib/domain/donation.ts` (changing them needs a release).

The History screen (clock icon on the map) records a withdrawal or donation when the user taps Dial or Copy.
Withdrawals also come back from the server (`my_withdrawals()`), so they follow the account to a new phone; donations
stay on the phone.

### Cash points

- Every withdrawal dialed with a usable position puts its agent on the map for all users (`record_withdrawal()`
  creates the point, or reuses the same code within 300 m). If the phone has no position, or one vaguer than 100 m,
  at the moment of the dial, the withdrawal waits in the outbox for up to 3 minutes for a better fix (the user is
  back from the dialer by then) before it is sent anyway.
- Whoever added a point can delete it from its card (`delete_my_point()`), e.g. after a wrong code. The point is hidden
  for everyone, never deleted, so offline phones learn about it on their next sync. Who added a point stays private:
  only that user's own history says so (`my_withdrawals().created_point`).
- Nearby lists only agents within 100 m; the search box (Search button or the keyboard's search key) opens the
  closest agent with that code anywhere on the phone's map.
- Points sync per map cell (z12 tile) with `points_in_cell()`, an index range scan on `(sync_cell, updated_at, id)`
  whose cost does not grow with the size of the city. App builds released before it keep using `points_in_bbox()`.

Walking directions use the public FOSSGIS OSRM server (`routing.openstreetmap.de`, foot profile, fair use; credited in
the app). Without it, the app draws a straight line.

## Deploy (Vercel)

`vercel.json` builds with `npm run build`, serves `build/`, rewrites every route to the SPA shell and sets security
and caching headers.

Apply new migrations (`npm run db:push`) before or together with the app release: the app falls back to
`points_in_bbox()` while `points_in_cell()` is missing, but deleting a point needs `delete_my_point()`.

## Launch screen and installing

- `src/app.html` draws the launch screen (logo and name, light or dark) in plain HTML and CSS, so it is on screen from
  the first frame, before any script runs; `hideLaunchScreen()` removes it once the first screen has rendered. Its
  background matches the manifest's `background_color`, which Android uses for its own splash screen.
- Daily opens on the map: the Nearby list is folded to its title and the number of agents within 100 m, and no field
  is focused, so no keyboard comes up, also when coming back from the dialer (`openWithoutKeyboard()`).
- Right after a withdrawal is dialed (when the user comes back from the phone's dialer), Daily offers to add itself
  to the Home screen: the browser's install prompt where there is one (Android), otherwise the steps for Safari
  (iPhone, iPad), the browser menu (Android) or "open in your browser" (Facebook, Instagram… in-app browsers). After
  "Not now" it comes back after 3 days, and never after being turned down 3 times or once installed.

## Map

- Daily's own map (Protomaps, light and dark, usable offline) is built and uploaded to the public `tiles` bucket by the
  "Map tiles" GitHub workflow (monthly, or by hand from the Actions tab). It needs the repository variable
  `SUPABASE_URL` and the secret `SUPABASE_SECRET_KEY`. Once `manifest.json` is published, the app switches to it.
- Until then, Daily shows OpenFreeMap's online map (`liberty` in light mode, `dark` in dark mode). It is fetched
  while MapLibre loads, without waiting to hear whether Daily's own map exists, and a failed load is tried again
  (after 2, 5, 10, then every 30 seconds, and at once when the phone is back online or Daily comes back on screen).
- The cash points are drawn straight away on a plain background, whatever the map underneath is doing.
