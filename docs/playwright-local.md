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

Treat every local artifact as sensitive test output. Do not commit or manually
upload reports, screenshots, traces, videos, fixture credentials, invitation
values, or browser storage. Suites that handle invitation values disable
tracing and video, so debug them with visible UI state and the server-side
database assertions rather than recording secrets.

## Continuous integration behavior

Every pull request and push to `main` calculates whether the `Chromium
Playwright` job is required from the complete changed-path set. Relevant changes
include the application, Supabase, end-to-end tests, Playwright runner and
configuration, package and framework configuration, and the CI detector itself.
The explicit, conservative list is maintained in
[`../.github/ci-playwright-paths.txt`](../.github/ci-playwright-paths.txt);
update that manifest and its detector tests whenever a newly added path can
affect browser behavior. Both sides of renames are evaluated, while missing or
unavailable comparison revisions fail open and run the suite. Documentation-only
and unrelated repository-automation changes intentionally skip it without
skipping fast validation or the stable `CI Gate` check.

When required, the job runs against an isolated local Supabase stack. It
installs Chromium, resets the database, invokes the same production-build
`npm run test:e2e` path, and removes the stack in an unconditional cleanup step.
Use the CI workflow's `Run workflow` control with **Run the complete Chromium
Playwright suite regardless of changed paths** enabled to force the full suite
for troubleshooting or release confidence. Video is disabled because failure
screenshots, the HTML report, and traces provide the required diagnostics with
less sensitive output and lower storage cost.

Failure diagnostics are retained for seven days only after an automated scan
rejects environment files, signing keys, private-key material, service-role
markers, and Supabase secret-key markers. A failed scan blocks the Playwright
job and prevents artifact upload. Invitation suites disable tracing and video;
their reports and screenshots must not contain invitation values.

The exact branch-protection status check remains `CI Gate`. Before merge, that
stable aggregate check requires `Chromium Playwright` to succeed when it is
required and to be skipped only when the detector declares it unnecessary,
along with fast validation, path detection, and any required Supabase
integration work.
The subsequent `CI Gate` run on the merged push to `main` verifies the resulting
default-branch state; it does not replace the pre-merge required check.

Both local browser testing and CI execution are limited to disposable resources
provisioned for that run. This workflow does not authorize testing against
hosted Supabase projects, preview deployments, production systems, or
production data.

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
