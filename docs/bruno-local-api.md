# Local API testing with Bruno

The repository-owned Bruno collection exercises the Next.js
`GET /api/v1/engagements` endpoint with portal-issued machine credentials. It
does not call Supabase's generated data API or reproduce the human Supabase SSR
session protocol.

## Prerequisites

- Node.js 24.18.0 and installed repository dependencies.
- A running Docker-compatible container engine.
- The Bruno desktop client for interactive use.

Prepare the local services in the repository root:

```bash
npm run supabase:start
npm run supabase:reset
```

Start the portal in a separate terminal with the local server credentials
injected in memory:

```bash
npm run bruno:dev
```

This command does not print or persist the Supabase server credential or machine
signing key. The Bruno `Local` environment targets
`http://127.0.0.1:3000`.

## Interactive desktop workflow

Provision fresh deterministic fixture credentials for Bruno:

```bash
npm run bruno:setup
```

The command writes the credentials to the ignored `bruno/.env` file with
owner-only permissions and does not print them. Open the `bruno` directory as a
collection in Bruno, select the `Local` environment, and run the requests in
the `engagements` folder.

The collection covers:

- an unauthenticated `401`;
- malformed and unknown credentials with the same generic `401`;
- a valid machine without `engagements:read` receiving `403`;
- a capable machine without a required grant receiving an empty collection;
  and
- an authorized tenant A machine receiving only its granted engagement.

Run `npm run bruno:setup` again after resetting fixtures, expiring or revoking a
credential, or changing machine authentication data. Delete `bruno/.env` when
you no longer need interactive access. Never copy its values into an LLM prompt,
tracked file, browser code, screenshot, or support transcript.

Bruno can alternatively store `PORTAL_API_KEY` and the other variables listed
in `bruno/.env.example` in its local secret storage. Do not place actual values
in the tracked `Local.bru` environment.

## Deterministic CLI workflow

With Supabase and `npm run bruno:dev` already running, execute:

```bash
npm run test:bruno
```

This command reprovisions the local fixtures, keeps the API keys in memory,
removes service-role and machine-signing credentials from the Bruno child
process, and runs the pinned Bruno CLI collection. It does not create
`bruno/.env` or print authorization headers.

## Credential lifecycle and limitations

The fixture setup replaces the deterministic local integrations and issues
fictional credentials that expire in 2099. The application checks expiration
and revocation on every request, so replaced, revoked, or expired credentials
stop working immediately. Re-run the setup command to replace the local Bruno
credentials.

These instructions are for the local, read-only foundation only. There is no
hosted environment, production credential issuance, rotation workflow,
credential administration UI, machine write access, public exposure, or direct
credential access by an LLM.
