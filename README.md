# AI Consulting Client Portal

A private, local-first learning scaffold for the architecture described in the
client portal revised plan. It is intentionally a thin collaboration shell,
not a production portal or transaction system.

## What is included

- Next.js App Router, TypeScript, Tailwind CSS
- Local Supabase PostgreSQL, Auth, Storage, Studio, and test email inbox
- Tenant-aware organizations, memberships, and engagements with RLS
- Invitation-only onboarding persistence with independent staff authority
- A server-rendered authenticated workspace
- A versioned JSON:API engagements endpoint
- Read-only portal API-key authentication for machine engagement access
- Vitest, ESLint, type checking, builds, and GitHub Actions

## Run the full stack locally

Prerequisites: Node.js 24.18.0 (run `nvm use`) and a running Docker-compatible
container engine.

1. Install dependencies: `npm install`
2. Start Supabase: `npm run supabase:start`
3. Copy `.env.local.example` to `.env.local`. Replace the publishable and
   server-only secret keys with the values printed by `supabase start`, and
   copy the private JWK from the ignored `supabase/signing_keys.json` file into
   the server-only `MACHINE_JWT_PRIVATE_JWK` value.
4. Reset the local database: `npm run supabase:reset`
5. Start Next.js: `npm run dev`
6. Open `http://localhost:3000`, create a local account, and inspect the
   application identity flow. Deterministic fixtures provide the sample
   workspace; invitation issuance and acceptance remain deferred. Local emails
   appear at `http://127.0.0.1:54324`.

No Vercel or hosted Supabase account is required. Stop local services with
`npm run supabase:stop`.

For supported interactive and CLI testing of the machine API, use the
repository-owned Bruno collection described in
[`docs/bruno-local-api.md`](docs/bruno-local-api.md).

The local invitation persistence contract, including its deferred production
controls, is documented in
[`docs/invitation-foundation.md`](docs/invitation-foundation.md).

## Run application and database integration checks

Prerequisites:

- Node.js 24.18.0 with project dependencies installed.
- A running Docker-compatible container engine.
- Enough local Docker resources to run the Supabase development stack.
- The local Supabase stack started with `npm run supabase:start`.

Run the complete integration check suite with:

```bash
npm run test:integration
```

The command lints the migrated schema, replaces the deterministic fixtures, and
runs the authenticated RLS and JSON:API endpoint suites. It leaves the local
stack running for inspection; stop it afterward with `npm run supabase:stop`,
or use `npm run supabase:stop -- --no-backup` to remove its local data.

Production-built local browser checks use the same disposable Supabase
foundation. See [`docs/playwright-local.md`](docs/playwright-local.md) for the
required Playwright command, authoring modes, safety boundary, cleanup
guarantees, debugging and artifact guidance, CI behavior, and serial-execution
policy.

Each check is named in the output so schema, fixture, RLS, and endpoint failures
remain distinguishable. Supabase status output is captured where credentials
are needed; fixture provisioning uses the local service-role key only inside
the setup process and does not pass it to application or tenant-assertion code.

GitHub Actions owns the disposable CI lifecycle: it starts an isolated stack,
replays tracked migrations, runs the same checks, and removes the stack in an
unconditional cleanup step.

## Continuous integration checks

Every pull request and push to `main` runs linting, type checking, unit tests,
and the production build. A read-only filename detector separately decides
whether to start the Supabase integration job. Database migrations, Supabase
and server authorization code, machine credentials and grants, engagement data
access, API routes, integration fixtures and runners, dependency manifests, test
configuration, and CI detector changes require the full integration suite.
Clearly unrelated documentation, styles, static assets, and UI-only changes
skip the Supabase job.

The detector compares the complete before/after range without executing changed
repository code. It disables rename detection so both sides of a rename are
considered. Unknown or unavailable base revisions conservatively require the
integration suite. Relevant patterns are maintained in
`.github/ci-supabase-paths.txt` and covered by unit tests.

Every workflow invocation also runs the production-built `Chromium Playwright`
suite against its own disposable Supabase stack. Failure-only diagnostics are
retained for seven days only after the repository's artifact safety check
rejects server credentials and credential-bearing files.

`CI Gate` is the exact stable status-check name for branch protection. Before
merge, require that aggregate check on pull requests; it requires fast
validation, path detection, Chromium Playwright, and any required Supabase
integration to satisfy their contracts. The separate `CI Gate` result produced
by the push to `main` verifies the post-merge default-branch state and is not a
substitute for the pre-merge required check.

## Architecture boundaries

The browser uses Supabase only for the authentication protocol. Application
data passes through server-rendered routes or `/api/v1`, where server-side
authorization and PostgreSQL RLS both constrain access. JSON:API formatting is
kept at the HTTP boundary.

UI implementation follows the Tailwind-first [UI component strategy](docs/ui-component-strategy.md).

Machine API-key authentication is a separate, read-only server-side path. See
[Machine authentication safeguards](docs/machine-credentials.md) for the
credential boundary, grants, audit events, local signing setup, and deferred
production controls.

Stripe, agreement providers, production deployment, and AI workflows are
deliberately deferred.

## Governed change workflow

Repository changes use the same human-gated, label-driven Codex automation as
`ai-consulting-site`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the operating
flow and [docs/github-change-workflow.md](docs/github-change-workflow.md) for
the security boundary and required GitHub configuration.

Planning comments use a structured, human-review-first layout: Human Review
Summary, Teach Me, Decisions the Reviewer Should Challenge, then Machine
Implementation Details. The layout separates the concise approval surface from
implementation instructions; only a human can resolve decisions, approve the
documented scope, authorize AI implementation or splitting, and merge.
