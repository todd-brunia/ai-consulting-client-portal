# Local Playwright foundation

The Playwright suite runs only against a disposable local Supabase stack and a
production-built Next.js server. The runner refuses non-loopback, HTTPS, or
implicit-port targets before it provisions or mutates fixtures.

## Required local run

Use Node.js 24.18.0, install dependencies, and install Playwright's Chromium
binary once:

```bash
npm install
npx playwright install chromium
```

Start and reset the disposable local Supabase stack, then run the suite:

```bash
npm run supabase:start
npm run supabase:reset
npm run test:e2e
```

`test:e2e` provisions the existing deterministic integration fixtures, builds
the production application, serves it on an available loopback port, and runs
Chromium. The application server receives its required server credentials, but
the Playwright process and browser contexts do not. Authentication starts from
an empty storage state for every test. Reports and traces are ignored and must
never contain fixture secrets.

For local test authoring, use `npm run test:e2e:headed`. UI mode is available
with `npm run test:e2e:ui`; stop it when authoring is complete so the runner can
shut down the production server.

## Database verification and cleanup

Database-mutating tests use `tests/e2e/database-assertions.mjs`. It rechecks the
local Supabase target before creating its server-side admin client, supports
precondition and postcondition snapshots, and runs registered cleanup tasks in
reverse order from a `finally` block. Foundation coverage demonstrates
mutation, retention, deletion, idempotency, and absence of unrelated
engagement mutations.

The initial suite uses one Playwright worker and explicitly serial suites.
Parallelization requires per-worker fixture namespaces, independent users and
organizations, collision-free cleanup, and proof that no worker resets shared
fixtures while another is running. Increase `workers` only after those
isolation guarantees exist.
