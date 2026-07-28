# Invitation identity and membership foundation

Issue #39 establishes the local persistence contract for invitation-only
client onboarding. It deliberately does not create an invitation route,
acceptance route, email delivery path, or hosted configuration.

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

The migration and deterministic fixtures demonstrate the persistence contract
only. Local activation proves invitation acceptance and organization access; it
does not prove phone verification, terms acceptance, SMS consent, hosted
delivery, or production onboarding readiness.

## Deferred controls

Staff invitation issuance, token generation and acceptance, email delivery,
hosted Supabase configuration, production verification, and production
onboarding controls require separately approved work. Until then, fixture
provisioning is server-side and local/CI-only.
