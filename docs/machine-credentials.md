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

Database/RLS enforcement, the engagements route, rate limiting, hosted key
administration, rotation overlap, machine writes, and public exposure remain
separate governed work. The authorization context intentionally contains no
HTTP objects or credentials, Supabase clients or tokens, internally minted
JWTs, database connections, roles, transactions, or execution strategy.

## Local test safety

Credential generation accepts injectable entropy so unit and integration
fixtures can create deterministic ephemeral keys. Production/default execution
uses Node.js cryptographic randomness. Test credentials must remain fictional,
local, and ephemeral; complete keys must not be committed, logged, or exposed
to browser code.
