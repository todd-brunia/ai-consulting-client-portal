# Repository Publication Audit

## Conclusion

**PASS — proceed through issues #114 and #115's reviewed checkpoints.**

The current tree and reachable Git history passed history-aware secret
scanning, and the retained GitHub surfaces reviewed below did not reveal a
credential or client-data exposure. Reachable commit metadata contains the
repository owner's personal email address. On 2026-08-09, the owner explicitly
accepted its exposure through public Git history. That recorded acceptance
resolves the only audit blocker; no history rewrite is required.

This report is sanitized. It identifies evidence by category and location and
does not reproduce credential values, artifact payloads, private issue text, or
the personal email address.

## Scope and snapshot

- Repository: `todd-brunia/ai-consulting-client-portal`.
- Audited default branch: `main` at commit
  `f6dbfab1b09b6e34fe276558fc46033b593f436b`.
- Repository visibility at audit time: private.
- Git scope: every commit reachable through local refs after fetching current
  remote refs, including deleted and superseded paths represented in history.
- Tracked scope: application source, documentation, fixtures, migrations,
  workflows, issue templates, examples, dependency manifests, and repository
  policy.
- GitHub scope: 129 issue/pull-request records, 226 issue comments, current
  repository metadata, and retained Actions artifact metadata available on
  2026-08-09.
- Excluded secrets: GitHub Actions secret values and other provider credentials
  are not readable through repository APIs and were not requested or copied.

## Methods and evidence

### History-aware secret and private-data review

- Ran Gitleaks against all reachable refs with redaction enabled. It examined
  approximately 1.17 MB across 58 content-changing commits and reported no
  leaks. Merge-only and equivalent commits account for the difference from the
  complete reachable revision count.
- Inventoried tracked paths with credential-oriented names and checked ignore
  rules. Only non-secret examples, credential implementation/tests, and the
  local signing-key setup script are tracked. `.env.local` and
  `supabase/signing_keys.json` are explicitly ignored.
- Searched current publication-relevant text for credential, private-key,
  token, client-data, internal-only, environment, and production-boundary
  terms. Matches were reviewed as documentation, placeholders, local-only
  examples, tests, or server-side boundary descriptions rather than live
  values.
- Reviewed unique commit author identities without copying them into this
  report. Bot commits use a GitHub noreply address; human commits expose one
  personal email address in reachable metadata.

### Issues, pull requests, comments, and identities

- Sanitized API pattern checks found no non-noreply email address or private-key
  header in issue/pull-request bodies or comments.
- One closed issue body matched a token-assignment detector. It is issue #52,
  the credential-scanner implementation story, and contains a deliberately
  synthetic unsafe-patch example rather than an operational credential.
- No comment matched the credential assignment or private-key-header checks.
- Usernames, bot identities, issue plans, review history, and workflow records
  will become publicly attributable. They are repository governance evidence,
  not client identities or production data.

### Retained Actions artifacts

- GitHub reported 126 artifact records, of which 46 were retained at audit time
  and 54 of the first 100 metadata records were already expired.
- The retained set totaled 133,002 bytes: 22 validated Codex result artifacts,
  22 allowlisted usage records, and two compact split-plan artifacts.
- Artifact names, producing runs, sizes, creation/expiration times, retention
  configuration, upload paths, and repository artifact-safety contracts were
  reviewed. Current artifacts expire no later than 2026-08-12.
- Payloads were not reproduced in this report. The artifact classes are bounded
  planning/usage data already processed through trusted publisher validation;
  Playwright diagnostic upload separately fails closed on credential-bearing
  files and server-secret markers.
- Before a later visibility change, re-list retained artifacts and confirm that
  only these reviewed classes remain. An unknown artifact class, unexpectedly
  extended retention, or unavailable metadata changes the conclusion to BLOCK.

## Internal-only and publication-readiness inventory

| Area | Finding | Disposition |
| --- | --- | --- |
| README privacy wording | The introduction calls the repository private. | Must be updated by issue #114 before publication. |
| Proprietary terms | The root `COPYRIGHT.md` states the all-rights-reserved/no-reuse policy and distinguishes third-party material under its own applicable terms. | Aligned by issue #134; retain the notice when updating repository policy. |
| Vulnerability reporting | Public-safe reporting guidance is not yet present at the repository root. | Must be added by issue #114. |
| Local credentials | Documentation describes generated local Supabase secrets and an ignored signing key. | Safe if the local-only/server-only boundary and placeholders remain explicit. |
| Fictional fixtures | Test accounts, organizations, credentials, and portal content are deterministic local/CI fixtures. | Safe; preserve explicit fictional/local-only labeling. |
| Automation governance | Workflows expose policy, action pins, check names, App permission intent, and human gates. | Safe and desirable public governance evidence; no secret values are tracked. |
| Hosted production | Vercel, hosted Supabase, releases, deployment, payments, and production client data remain deferred. | Safe; do not imply operational production readiness. |
| Repository history | Human commit metadata contains a personal email address. | Owner accepted public Git-history exposure on 2026-08-09; resolved. |

## Publication blockers and required recheck

1. Complete issue #114's proprietary notice, vulnerability-reporting guidance,
   and public-ready wording, then scan the resulting tree and history.
2. Immediately before issue #115 changes visibility, re-fetch all refs, rerun
   redacted history scanning, repeat sanitized issue/comment checks, inventory
   retained artifacts, verify the exact default-branch SHA, and confirm no
   unknown or unavailable evidence.

Repository visibility, branch protection, merge settings, credential changes,
artifact deletion, and history rewriting are outside issue #113 and were not
performed.
