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

Resetting Supabase replaces local data with the tracked migrations and seed
state. The Playwright runner then reprovisions the deterministic integration
fixtures before each suite invocation. Tests that create or mutate additional
records register cleanup tasks and run them even after an assertion failure.
The baseline integration fixtures remain available for inspection; reset the
stack again before the next run if you changed them manually, and stop it with
`npm run supabase:stop` when finished.

For local test authoring, use `npm run test:e2e:headed`. UI mode is available
with `npm run test:e2e:ui`; stop it when authoring is complete so the runner can
shut down the production server.

## Debugging and artifacts

Start with the list reporter's failing test name and assertion. Re-run the
smallest relevant file or title through the same guarded runner, for example:

```bash
npm run test:e2e -- tests/e2e/auth-workspace.spec.ts
npm run test:e2e -- --grep "signs out"
```

Use `npm run test:e2e:headed` to observe browser behavior or
`npm run test:e2e:ui` for Playwright's interactive authoring tools. Failures
write screenshots and retained traces to the ignored `test-results/` directory,
and the HTML reporter writes the ignored `playwright-report/` directory. Open
the last report with:

```bash
npx playwright show-report
```

Treat every artifact as local-sensitive test output. Do not commit or upload
reports, screenshots, traces, videos, fixture credentials, invitation values,
or browser storage. Suites that handle invitation values disable tracing and
video, so debug them with visible UI state and the server-side database
assertions rather than recording secrets.

## Continuous integration behavior

The current GitHub Actions workflow runs linting, type checking, unit tests,
the production build, and conditionally the Supabase integration suite. It does
not yet run `npm run test:e2e`; Playwright CI execution and artifact retention
remain separately scoped work. Until that lands, contributors must run the
applicable browser coverage locally and record the result in the pull request.

Both local browser testing and any future CI execution are limited to
disposable resources provisioned for that run. This workflow does not authorize
testing against hosted Supabase projects, preview deployments, production
systems, or production data.

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

## Supported browser journeys

The serial Chromium suite covers the existing unauthenticated workspace
redirect, successful and unsuccessful login, safe invitation and staff-route
destination preservation, rejection of external or protocol-relative return
destinations, authenticated workspace rendering, tenant-scoped engagement
visibility, generic forbidden staff access, sign-out, client invitation
acceptance lifecycle outcomes, and staff invitation issuance, inspection,
replacement, and revocation.

These journeys use the deterministic tenant users from
`tests/integration/supabase-fixtures.mjs` and assert through accessible labels,
roles, headings, visible text, and URLs. Cross-tenant protection is represented
by the absence of the other tenant's organization and engagement; the tests do
not attempt to expose or distinguish protected resource identifiers.
