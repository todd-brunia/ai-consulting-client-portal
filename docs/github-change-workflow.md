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

## Codex usage measurement pilot

Each `plan`, `revise`, and `implement` attempt that reaches Codex also starts a
repository-owned OTLP/HTTP receiver on loopback. Its trusted code and isolated
Codex home live in runner-temporary storage, outside the model-writable
checkout. Prompt logging is disabled. The receiver accepts only the pinned
completed-response token fields, keeps requests in memory, and writes a
short-lived, allowlisted `ai-usage/v1` artifact. It never writes prompts,
responses, reasoning, source, commands, tool output, raw telemetry,
credentials, API/project identifiers, or pricing.

A separate trusted job validates the artifact and appends one comment to the
originating issue. The comment contains a readable summary, workflow-run link,
and compact JSON event. Its deterministic marker derives from repository, run
ID, run attempt, and stage, so publisher retries do not duplicate the record.
Artifacts are retained for three days. Token classes remain separate; cached
input and reasoning output are not added to a derived total.

Measurement is observational and fail-open. Missing, malformed, or unavailable
telemetry produces `measurement_status: unavailable` with all token counts set
to `null`; it does not block planning or implementation publication. Events are
not created for skipped or rejected triggers because Codex is not invoked. A
hard workflow cancellation can prevent finalization and is an explicit pilot
limitation; cancellation reconciliation, local interactive measurement,
pricing, dashboards, and centralized telemetry storage remain out of scope.

## Failure recovery

Failures apply `blocked` and link the workflow run without exposing model traces
or secrets. Resolve the underlying cause before retrying; removing `blocked`
alone does not restart a workflow.

For a direct authorization-refusal failure, first correct the trusted-state or
authorization problem reported by the run. Confirm that the issue and its
frozen plan still meet the implementation preconditions, then:

1. Remove `blocked`.
2. Reapply `approved-for-ai-build` to intentionally start a new automated run.

`approved-for-build` remains the general approval for the documented scope and
the manual implementation path. It is not the automation retry trigger, so
removing and reapplying it does not authorize a label-triggered Codex build.
Implementation failures remove only `approved-for-ai-build`, preserving the
general approval while requiring a fresh human automation authorization.

Do not bypass or weaken either approval gate to recover a failed run. Fix the
trusted validation, repository configuration, credential handling, or other
root cause first; then use the label sequence above for the retry.

For issue #73, wait until the patch-validator fix is merged to `main`, then
remove `blocked` and reapply `approved-for-ai-build`. Do not rerun the failed
job; it uses the validator version that rejected the valid patch.

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
