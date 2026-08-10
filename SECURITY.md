# Security Policy

## Reporting a vulnerability

Use GitHub private vulnerability reporting: open this repository's
**Security** tab, select **Advisories**, and choose **Report a vulnerability**.
Issue #115's public-visibility checkpoint must enable and verify that private
path before the repository becomes public.

If the private reporting button is unavailable, do not open a public issue or
share vulnerability details through a discussion, pull request, commit,
Actions log, artifact, or model prompt. Notify the repository owner through a
non-sensitive GitHub contact first and wait for a private channel before
sending technical details.

Do not include live credentials, client data, production identifiers, or more
proof-of-concept material than is necessary to explain the issue. The owner
will coordinate validation, containment, and disclosure timing.

## Supported scope

Only the latest `main` branch is supported. This repository is a local-first
learning scaffold, not a hosted production service. Vercel, hosted Supabase,
payments, releases, production deployment, and production client data are not
part of the current system.

Security reports may cover the tracked application, Supabase migrations and
authorization policies, local/CI credential boundaries, GitHub workflows, and
dependency configuration. Local fixture accounts and documented placeholder
credentials are fictional and are not vulnerabilities by themselves.

## Public disclosure

Coordinate disclosure with the repository owner. Do not publish exploit
details while a report is being validated or remediated. Public visibility and
the absence of an open-source license do not weaken the credential, privacy,
or human-approval boundaries described in [CONTRIBUTING.md](CONTRIBUTING.md).
