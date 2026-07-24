# Machine credential foundation

The portal treats an `AgentIntegration` as a named machine principal. It is not
a human user, a Supabase Auth identity, or an identity that may impersonate
either. The local `GET /api/v1/engagements` endpoint accepts portal-issued
machine credentials for read-only access.

## Credential contract

Portal API keys use this shape:

```text
portal_agent_<non-secret lookup prefix>_<random secret>
```

The complete key is returned only by credential creation. PostgreSQL stores the
lookup prefix, a salted scrypt verification value, the owning integration,
creation and expiration times, last-use time, and revocation time. It never
stores a recoverable key.

Machine credentials are accepted only from:

```text
Authorization: Bearer <portal-issued-api-key>
```

Query parameters, form fields, and cookies are not supported credential
transports. Verification returns a single generic invalid result for malformed,
unknown, expired, revoked, and incorrect credentials. Returned metadata and
errors exclude complete keys and verification hashes.

## Capabilities and grants

The initial capability vocabulary contains only `engagements:read`.
Organization and engagement grants are stored separately and default to no
access. A verified credential can be resolved into a transport-neutral machine
authorization context containing only its stable integration ID, capabilities,
and a copied application-layer grant snapshot. Engagement reads require the
`engagements:read` capability and both the requested organization and engagement
to appear in that snapshot. Authentication failure and authorization denial are
separate, generic outcomes that do not disclose principal or resource details.

Human and machine principals form an explicit discriminated union. Human
engagement access continues through the existing human policy and Supabase
session path; it is never converted into a machine identity.

Rate limiting, hosted key administration, rotation overlap, machine writes, and
public exposure remain separate governed work. The authorization context itself
intentionally contains no HTTP objects or credentials, Supabase clients or
tokens, internally minted JWTs, database connections, roles, transactions, or
execution strategy.

## Machine database boundary

Trusted server code may bridge a verified machine principal to the Supabase
Data API with a 60-second internal ES256 JWT. The token contains only its
issuer, audience, issue and expiry times, the dedicated `portal_machine`
PostgreSQL role, and the stable `machine_integration_id`. It never contains
capabilities, organization or engagement grants, caller scope, the external API
key, or a human user identity.

The application-owned ES256 private key must be imported into the Supabase
project's current JWT Signing Keys system. Server code supplies the short-lived
token through the supported Supabase client `accessToken` option. The key and
token remain server-only and must not be logged or returned. This design does
not use the deprecated legacy JWT secret or a service-role query.

PostgreSQL assigns the token's narrowly privileged `portal_machine` role. RLS
validates the expected machine claims and uses a locked-down helper to join the
current integration, `engagements:read` capability, organization grant, and
engagement grant. Both grants must match the row. The machine role can select
only engagements and their visible organizations; it has no direct access to
credential or grant tables and no write privileges.

Human sessions continue to use the existing `authenticated` policies. Machine
and human policies are separate and independently tested.

The HTTP integration verifies the external portal API key and resolves a fresh
machine principal on every request before calling this database boundary. It
does not cache the principal or internal token across requests; that preserves
immediate rejection of revoked or expired external credentials.

## Engagements API behavior

Human requests without a bearer credential retain the existing Supabase-session
path. Machine requests use `Authorization: Bearer <portal-issued-api-key>`.
Requests containing both a valid human session and any bearer attempt are
rejected rather than choosing one identity.

Missing, malformed, unknown, expired, and revoked authentication all return the
same generic JSON:API `401` document. A valid machine without
`engagements:read` receives a generic `403`. A capable machine receives `200`
with the existing JSON:API collection shape, and RLS limits rows to current
organization and engagement grants. No matching grants returns an empty
collection.

A server-only project secret is used only to verify credential hashes and read
current authorization metadata. Engagement data is never queried with that
secret; it continues through the short-lived `portal_machine` token and RLS
boundary.

## Machine request audit events

When a machine principal has been resolved, the engagements API writes one
structured server log event for the final request outcome. The finite event
contract contains only:

- the event name `machine_request`;
- the machine integration ID;
- the request category `engagements.read`;
- the result `success` or `rejected`; and
- the server emission time as an ISO 8601 timestamp.

Human requests and rejected requests without a resolved principal do not emit
machine audit events. The helper constructs the event from an allowlist and
does not accept request objects or errors, so bearer headers, complete API keys,
credential verification material, service-role credentials, grants, and client
content cannot be serialized into the event. Audit sink failures are ignored so
they cannot alter or disclose details through the API response.

These events use local server logging only. Hosted monitoring, retention,
alerting, rate limiting, and public operational controls remain deferred.

### Local signing setup

Starting the local stack generates an untracked ES256 signing key when one does
not already exist:

```bash
npm run supabase:start
```

The setup utility writes `supabase/signing_keys.json`, which is ignored by Git
and loaded through `supabase/config.toml`. Restart the local stack after
changing the key. Copy the private JWK JSON into the server-only
`MACHINE_JWT_PRIVATE_JWK` value in `.env.local`; never use a `NEXT_PUBLIC_`
prefix.

For hosted Supabase, import the same application-controlled public/private JWK
through the project's JWT Signing Keys workflow and rotate it into use. Hosted
secret configuration and rotation are intentionally not automated here and
must be completed before public machine access.

References:

- [Supabase JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Using custom JWTs](https://supabase.com/docs/guides/auth/jwts#using-custom-or-third-party-jwts)

## Local test safety

Credential generation accepts injectable entropy so unit and integration
fixtures can create deterministic ephemeral keys. Production/default execution
uses Node.js cryptographic randomness. Test credentials must remain fictional,
local, and ephemeral; complete keys must not be committed, logged, or exposed
to browser code.
