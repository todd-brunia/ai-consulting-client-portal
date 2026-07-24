# Machine credential foundation

The portal treats an `AgentIntegration` as a named machine principal. It is not
a human user, a Supabase Auth identity, or an identity that may impersonate
either. This local-first foundation does not expose a machine-accessible API
route yet.

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

The machine-facing engagements route, rate limiting, hosted key administration,
rotation overlap, machine writes, and public exposure remain separate governed
work. The authorization context itself intentionally contains no HTTP objects
or credentials, Supabase clients or tokens, internally minted JWTs, database
connections, roles, transactions, or execution strategy.

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

The future HTTP integration must verify the external portal API key and resolve
a fresh machine principal on every request before calling this database
boundary. It must not cache the principal or internal token across requests;
that preserves immediate rejection of revoked or expired external credentials.

### Local signing setup

Generate an untracked local ES256 signing key:

```bash
npx supabase gen signing-key
```

The CLI writes `supabase/signing_keys.json`, which is ignored by Git and loaded
through `supabase/config.toml`. Restart the local stack after generating or
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
