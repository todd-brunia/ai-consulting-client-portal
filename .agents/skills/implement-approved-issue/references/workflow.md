# Local implementation workflow reference

## Choose the implementation path

Use this skill for an occasional interactive implementation after general plan
approval. Use label-triggered automation when the owner deliberately applies
`approved-for-ai-build`. Applying `approved-for-build` alone never starts GHA.

The local path may use the user's authenticated GitHub CLI only when the prompt
explicitly authorizes publication. It does not inherit the GitHub App publisher
boundary and must not impersonate that automation.

## Approval snapshot

Read the issue timeline to establish when `approved-for-build` was applied. The
approved record consists of the newest marked base plan before that time plus
trusted owner/collaborator discussion and marked amendments through that time.
Later comments are review input, not silent scope expansion.

If approval predates the marked plan or a material amendment, report that the
issue must return to `plan-ready` and require reapproval. Change labels only
when the invoking request authorizes that GitHub mutation. If GitHub access
fails, stop rather than using conversation memory as the plan of record.

## Pull request conventions

Prefer a descriptive title. Use `Implement #<number>: approved plan` when a
better issue-specific title is not evident.

Use this body shape:

```markdown
## Summary

<Concise outcome and important design choices.>

## Originating issue

Closes #<number>

## Validation

<Every command and result, including blocked or unrun checks.>

## Accessibility

<Semantic, keyboard, focus, contrast, responsive, or no-impact assessment.>

## Documentation impact

<Updated, follow-up, or none, with the approved reason.>

## Known limitations

<Deferred work, preview status, screenshots or visual instructions, and risks.>
```

Do not add an automation marker, planning fingerprint, bot identity, or fake
workflow-run URL. Add a real preview URL only when one exists.

## Issue transition after PR confirmation

Remove these labels when present:

- `approved-for-build`
- `plan-ready`
- `blocked`

Add `in-progress`. Do not touch category/classification labels. Post a plain
comment such as:

```text
Local interactive implementation draft: <pull-request-url>
```

## Failure report

When work cannot complete, preserve user and agent changes and report:

- current branch and base;
- commit status and changed paths;
- validation commands and exact failures;
- whether anything was pushed;
- whether a draft PR exists; and
- current issue labels.

Never advance labels before confirming the draft PR.

## Full sample prompt

```text
Use $implement-approved-issue to implement GitHub issue #<number> locally.

Verify the frozen approval record before editing. This is the interactive local
path, not label-triggered automation. Preserve unrelated work, create a
descriptive non-codex branch from current origin/main, implement only the
approved scope, and run every required and issue-specific validation command.

If implementation is satisfactory, you are authorized to commit, push, open a
linked draft pull request, comment with its URL, and transition the issue to
in-progress. Use the repository PR sections and report all validation results
truthfully. Do not use automation markers or bot identity, and do not approve,
merge, release, deploy, or mark preview-ready.
```

## Short sample prompt

```text
Use $implement-approved-issue for issue #<number>. Implement the frozen approved
scope locally and, after validation, publish the linked draft PR and move the
issue to in-progress. Do not merge.
```

## Worked example

Issue #60 was implemented interactively on the non-reserved branch
`issue-60-oversized-scope-controls` and published as PR #61. Its commit and PR
body followed automation-style conventions, while the human-authored branch,
plain issue comment, and absence of hidden automation markers made the local
execution path explicit. This is an example of process shape, not authorization
to reuse its exact scope or GitHub state.
