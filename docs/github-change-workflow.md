# GitHub Change Workflow

## State labels

| Label | Meaning |
| --- | --- |
| `needs-planning` | Codex planning is requested. |
| `plan-ready` | The plan awaits human review. |
| `changes-requested` | Human feedback requires a focused revision. |
| `approved-for-build` | A human approved the documented scope. |
| `approved-for-ai-build` | A human separately authorized Codex implementation. |
| `in-progress` | Implementation is underway. |
| `preview-ready` | Checks and any preview are ready for review. |
| `blocked` | A decision, permission, or external change is required. |
| `needs-decision` | Planning found a material unresolved decision. |
| `split-proposed` | Codex proposed bounded child issues. |
| `approved-for-split` | A human authorized the split publisher. |
| `split-parent` | The parent was decomposed into confirmed children. |

Normal flow:

```text
needs-planning → plan-ready → approved-for-build → in-progress → preview-ready → closed
```

Applying `approved-for-build` freezes the newest marked plan and the trusted
planning discussion preceding approval. It authorizes the manual implementation
path, including explicitly invoked local interactive Codex work, but does not
start label-triggered automation. `approved-for-ai-build` is the separate
automation trigger.

## Automation boundary

The label event validates the actor, issue state, frozen planning snapshot, and
replay fingerprint from trusted default-branch code. Codex receives untrusted
issue context in a disposable checkout without a GitHub write credential.

For implementation, Codex produces a schema-validated report and patch. A
separate job checks out `main`, revalidates and applies the patch, runs the full
suite, and only then creates a short-lived GitHub App token to push
`codex/issue-<number>` and open a draft pull request.

The split publisher does not invoke Codex after approval. It revalidates the
structured split proposal and creates or reuses marked child issues
idempotently.

Automation does not approve plans, apply `approved-for-build`, mark
`preview-ready`, merge, release, deploy, or push to `main`.

## Failure recovery

Failures apply `blocked` and link the workflow run without exposing model traces
or secrets. Resolve the cause, remove `blocked`, and reapply the stage label.
Implementation failure removes only `approved-for-ai-build`, preserving general
approval for an intentional retry.

## Required repository configuration

- Variables: `CODEX_AUTOMATION_ENABLED`, `CODEX_ALLOWED_ACTORS`, and
  `CODEX_AUTOMATION_APP_ID`.
- Secrets: `OPENAI_API_KEY` and `CODEX_AUTOMATION_APP_PRIVATE_KEY`.
- Default Actions token permission: read-only; pull-request approval disabled.
- The publisher GitHub App must be installed for this repository with the
  permissions required to push branches, open draft pull requests, and update
  issues.
- Protect `main` with pull requests, the `validate` check, no force pushes, and
  no automation bypass before public release.

The repository is currently private. GitHub Free does not enforce repository
rulesets for private repositories; keep it private and owner-controlled until a
supporting plan or public visibility makes protection available.
