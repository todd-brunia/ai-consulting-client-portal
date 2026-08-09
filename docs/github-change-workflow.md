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

## Structured planning comments

Planning and revision use the versioned `plan/v2` contract. The trusted
publisher validates the structured result and renders these top-level sections
in a stable order:

1. **Human Review Summary** — objective, executive summary, key decisions,
   tradeoffs, risks, open questions, one-sentence file impacts, and the ordered
   implementation sequence. A Human Decision Required or Proposed Decomposition
   subsection appears here when classification requires it.
2. **Teach Me** — issue-specific concepts with what each concept is, why it is
   used, and why it is preferred to obvious alternatives. A sentence explicitly
   states when no concepts apply.
3. **Decisions the Reviewer Should Challenge** — material architectural,
   dependency, API, security, performance, compatibility, or operational
   choices. The publisher renders an explicit empty state instead of padding.
4. **Machine Implementation Details** — repository-grounded scope, invariants,
   tests, and validation for the implementing agent.

Review all four sections before approval. `approved-for-build` approves the
complete marked planning record, not only the executive summary. It does not
authorize a model to approve its own plan, make a human decision, begin a split,
trigger AI implementation, merge, or deploy. Existing approved comments using
the legacy marked-plan layout remain valid implementation inputs and continue
to provide bounded pull-request titles; automation does not rewrite them.

Classification controls the next human action:

- `focused` moves to `plan-ready`. Request a revision or apply
  `approved-for-build` after review.
- `needs-decision` moves to `needs-decision`. A human records the chosen
  option ID plus any governing constraints or rationale in a trusted comment,
  removes `needs-decision`, and applies `needs-planning` to produce a new plan.
  The displayed options include practical effects and tradeoffs, and exactly
  one is visibly recommended with an evidence-based rationale. That
  recommendation is advisory: model output never records the choice, clears the
  label, applies approval, or authorizes implementation.
- `split-required` moves to `split-proposed`. Review the proposed children and
  apply `approved-for-split` only when the decomposition should be published.
  Split approval does not approve any child for implementation.

### Split proposal envelope and publication budgets

New `split-required` comments encode a canonical `split/v2` envelope containing
only the trusted planning fingerprint and normalized child IDs, titles,
outcomes, acceptance criteria, dependencies, included and excluded scope, and
suggested topic labels. The complete `plan/v2` result remains visible for human
review; unrelated review and machine-implementation sections are not duplicated
in the hidden marker.

Trusted publication measures UTF-8 bytes against separate named limits:

| Component | Limit |
| --- | ---: |
| Visible heading and rendered `plan/v2` Markdown | 14,000 bytes |
| Encoded compact split marker | 5,500 bytes |
| Trusted marker and newline framing | 500 bytes |
| Complete public comment | 20,000 bytes |

Every applicable component and the final body must pass its limit, and the
existing global public-text validator remains the final credential and size
check. Size failures report only the component name, measured bytes, and limit;
they never echo model text or encoded data. Publication happens before label
transition, so a rejected body cannot appear successful. The existing failure
reporter removes the triggering planning or revision label, applies `blocked`,
and posts its bounded workflow-run diagnostic.

The decoder accepts legacy `{ digest, result }` markers published before
`split/v2`, normalizes them to the same trusted child-only representation, and
keeps the trusted-bot, stage-marker, fingerprint, and human split-approval
checks. New comments emit only `split/v2`. Keep legacy reads until all
historical split proposals that may still be approved are closed or explicitly
superseded; removal requires a separately approved issue and an inventory
proving no actionable legacy marker remains. Historical comments are never
rewritten.

## Automation boundary

The label event validates the actor, issue state, frozen planning snapshot, and
replay fingerprint from trusted default-branch code. Codex receives untrusted
issue context in a disposable checkout without a GitHub write credential.

For implementation, Codex produces a schema-validated report and patch. A
separate job checks out `main`, revalidates and applies the patch, runs the full
suite, and only then creates a short-lived GitHub App token to push
`codex/issue-<number>` and open a draft pull request.

The split publisher revalidates the structured split proposal and creates or
reuses marked child issues idempotently. After every child is confirmed and the
parent transition completes, the same trusted workflow passes only the exact
publisher-produced child numbers, child IDs, parent number, and approved split
fingerprint to a plan-only reusable workflow. That workflow independently
revalidates the closed `split-parent`, approved proposal fingerprint, exact
child marker, open state, and `needs-planning` label before Codex runs. It has no
dispatch or issue-event trigger and cannot select implementation or another
privileged stage.

GitHub validates a reusable workflow's complete permission contract before it
evaluates job conditions. The `plan_split_children` caller therefore grants the
called workflow's maximum bounded permissions—read access to actions and
contents plus issue write access—while the parent workflow keeps its read-only
top-level default. The called generation job further reduces its token to read
access; only its trusted publication job retains issue write access. Keeping the
grant on the caller job prevents unrelated jobs from inheriting it.

Retries reuse existing children and skip a child that already has a marked plan
or has advanced beyond `needs-planning`. A tampered identity or fingerprint
fails visibly; partial child publication does not start the handoff. Ordinary
bot-applied label events still fail the normal human actor check—
`github-actions` is not a generally trusted planning actor. Each child still
requires human plan review and implementation approval; split approval grants
neither.

GitHub creates a workflow run for every `issues: labeled` event and does not
support filtering that trigger by label name. Non-stage labels therefore remain
visible as skipped runs after job guards are evaluated; they do not invoke Codex
and must not fail workflow graph validation.

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

Receiver finalization uses a runner-temporary stop request and an atomic terminal
result instead of shell process ownership across Actions steps. The finalizer
waits up to five seconds for the loopback receiver to stop accepting requests,
drain accepted requests, and publish its result. The terminal result is written
to a restrictive temporary file and renamed into place, so its presence is the
completion acknowledgement rather than a partially written measurement.

Measurement is observational and fail-open. Missing, malformed, or unavailable
telemetry produces `measurement_status: unavailable`, one fixed sanitized
`measurement_reason`, and all token counts set to `null`; it does not block
planning or implementation publication. Reasons distinguish no completed
response, rejected telemetry, receiver startup failure, invalid terminal output,
and finalization timeout without including exception text or payload content.
Events are
not created for skipped or rejected triggers because Codex is not invoked. A
hard workflow cancellation can prevent finalization and is an explicit pilot
limitation; cancellation reconciliation, local interactive measurement,
pricing, dashboards, and centralized telemetry storage remain out of scope.

The workflow pins the Codex CLI contract used by `openai/codex-action` to
`0.147.0`. When that version changes, update the pin and the sanitized
completed-response fixture in `.github/fixtures/codex-usage/` together, review
the allowlisted attributes, and run the telemetry unit and process-lifecycle
tests before merging.

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

### Recovery checkpoint for split publication #115, #117, and #119

After the compact-envelope change is merged and its workflow tests pass, retry
#115, #117, and #119 one at a time. For each issue, confirm it is still open and
blocked for the publication-size failure, remove `blocked`, and reapply
`needs-planning` as the owner. Verify that exactly one current planning marker
is published, its `split/v2` envelope decodes to the displayed children, and the
issue reaches `split-proposed` before retrying the next issue. Do not rerun the
old workflow, reuse its expiring artifact, or bulk-change the three issues.

### Recovery checkpoint for split children #105–#110

The split-to-plan handoff is intentionally not applied retroactively. After
the reusable-workflow permission fix is merged, first verify a controlled
planning invocation creates jobs instead of ending in `startup_failure`. An
owner may then recover #105–#110 one at a time only after confirming that
each issue is still open, has exactly one expected split-child marker, remains
in `needs-planning`, has no marked planning comment, and has not acquired any
advanced workflow-state label. Record that checkpoint in a trusted issue
comment, then remove and reapply `needs-planning` as the owner to start the
ordinary human-authorized plan path. Do not use a bot, bulk dispatch, or an
implementation label, and stop for human review if any checkpoint differs.

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
