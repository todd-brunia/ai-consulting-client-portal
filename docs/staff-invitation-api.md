# Staff invitation lifecycle API

Issue #42 adds local, server-side invitation lifecycle operations for an
independently authorized `staff_admin`. Client organization membership never
grants this authority.

## Contract

Invitations expire 72 hours after database creation. At most one unexpired,
pending invitation may exist for an organization and normalized email.
Duplicate issuance returns `409`; replacement is always explicit. Replacement
atomically creates a fresh invitation and invalidates the prior record.
Revocation is idempotent. Row and transaction advisory locks ensure one winner
when issue, replace, revoke, or client consumption races.

The application generates a 256-bit opaque token and persists only its SHA-256
hash. The raw token is passed only to the local Supabase email-link provider and
is never returned by the API or written to application logs. Delivery refuses
non-local Supabase or application origins, so hosted onboarding remains
fail-closed.

## Routes

All successful and error responses use `application/vnd.api+json`.

| Method | Route | Result |
| --- | --- | --- |
| `POST` | `/api/v1/invitations` | Issue for `organizationId` and `email`. |
| `GET` | `/api/v1/invitations?organizationId=<uuid>` | Inspect an organization’s invitations. |
| `GET` | `/api/v1/invitations/<id>` | Inspect one invitation. |
| `POST` | `/api/v1/invitations/<id>/replace` | Explicitly replace a pending invitation. |
| `POST` | `/api/v1/invitations/<id>/revoke` | Revoke, or return an already-revoked representation. |

Successful inspection includes safe organization display data, normalized
email, derived status, lifecycle timestamps, creator identity, and replacement
lineage IDs. It excludes raw tokens, hashes, provider links, secrets, and
provider responses.

Errors use `401` for missing authentication, `403` for authenticated callers
without `staff_admin`, `404` for unknown or inaccessible resources, `422` for
syntactically invalid input, and
`409 invitation_lifecycle_conflict` for stale or conflicting mutations.
Database and provider details are never returned.

## Local verification

Start and reset Supabase, then run the portal with local server configuration:

```bash
npm run supabase:start
npm run supabase:reset
npm run bruno:dev
```

Sign in at `/login` with the local staff fixture
`staff-admin@portal.test` / `local-integration-only-password`, then open
`/staff/invitations`. The interface lets an authorized staff administrator
select an organization, issue an invitation using a normalized email address,
inspect lifecycle details, and explicitly replace or revoke an invitation.
Status and error feedback is announced to assistive technology and receives
focus after each operation.

The serial Chromium regression suite covers staff-route authentication,
ordinary-client denial, labeled keyboard-operable controls at a narrow
viewport, organization scoping, invalid and duplicate issuance, issue, inspect,
refresh, replace, revoke, stale conflict, and idempotent revoke behavior.
Server-side assertions verify lifecycle lineage and the absence of unintended
mutations. The suite disables tracing and video, never names invitation values,
and verifies that persisted hashes and privileged credential markers are absent
from the rendered interface. The disposable local Auth stack uses a raised
email allowance so repeated issue-and-replacement test runs do not exhaust the
provider default; this does not configure or relax hosted rate limits.

In another terminal, run `npm run bruno:setup` for the desktop collection or
`npm run test:bruno` for the pinned CLI contract. The ignored Bruno environment
contains a short-lived local staff session and organization ID. Do not copy
that cookie into tracked files, prompts, screenshots, or support transcripts.

Production email/SMS, hosted provider configuration, client acceptance changes,
organization creation, phone verification, consent, terms, and additional
roles are not part of this API or interface. The interface never displays a raw
invitation token.
