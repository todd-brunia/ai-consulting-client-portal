# Invitation identity and membership foundation

Issue #39 established the persistence contract for invitation-only client
onboarding. Issue #41 adds local client authentication and acceptance while
leaving email delivery and hosted configuration out of scope.

## Identity and authority

`application_users` is the stable portal identity. It maps one-to-one to a
Supabase Auth user, while keeping application references separate from the
authentication provider ID. The auth-user trigger creates this identity only;
it no longer creates a personal organization or membership.

`staff_authorities` records the single initial `staff_admin` authority.
It is independent of `organization_memberships`: a `client_member` never gains
staff authority from a membership, and staff authority is not inferred from an
organization role.

## Organization access

Each membership has the `client_member` role and one lifecycle state:
`pending`, `active`, or `revoked`. Only active client memberships receive the
tenant-scoped organization, membership, and engagement RLS policies. A
`staff_admin` can read those records independently so later staff-only work can
choose an existing organization without adding staff as a client member.

## Invitation records

`organization_invitations` belongs to an existing organization and records the
inviter, normalized recipient email, `client_member` role, expiry, consumption,
revocation, and replacement relationship. It persists a unique SHA-256 hash of
the opaque invitation token, never the token itself. A lifecycle record can be
consumed, revoked, or replaced once; expiration is derived from `expires_at`.
Replacement records identify the invitation that superseded the earlier record.

The `/invite?token=...` experience removes the raw token from the browser URL
before rendering the page, retains only its SHA-256 hash in a short-lived,
HttpOnly cookie, and requires Supabase authentication before acceptance. The
server-authorized database function locks the invitation, compares its hash and
normalized email, rejects every inactive lifecycle state with the same
non-disclosing result, and atomically activates only the matching pending
membership. The consuming identity is retained so the same user can safely
repeat a successful request.

Ordinary signup and authentication create only an application identity; neither
operation creates or activates organization membership. Local activation proves
invitation acceptance and organization access, but it does not prove phone
verification, terms acceptance, SMS consent, hosted delivery, or production
onboarding readiness.

## Browser regression coverage

The serial Chromium suite exercises the supported local client journey with the
deterministic lifecycle fixtures. It covers a missing or malformed link,
authentication failure, expired, revoked, replaced, consumed, unknown, and
wrong-account invitations, successful activation of exactly the intended
pending membership, and an idempotent retry by the consuming account. Every
inactive or mismatched case asserts the same non-disclosing unavailable state
and verifies that protected persistence remains unchanged.

Invitation tests disable Playwright tracing and never include invitation values
in test names or output. Browser actions use ordinary authenticated sessions;
the service-role client is confined to server-side precondition and
postcondition inspection. Run this coverage through the production-build
workflow documented in
[`playwright-local.md`](playwright-local.md).

## Deferred controls

Staff invitation issuance, production token delivery, hosted Supabase
configuration, production verification, and production onboarding controls
require separately approved work. Until then, invitation provisioning is
server-side and local/CI-only, and hosted onboarding remains fail-closed.
