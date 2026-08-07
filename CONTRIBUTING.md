# Contributing

Every tracked change starts with a GitHub issue and a reviewed plan. This
includes code, dependencies, migrations, documentation, CI, and repository
policy.

## Change flow

1. Open a Portal, Engineering, or DevOps/workflow issue. The template applies
   `needs-planning`.
2. Label automation posts a marked proposal and moves the issue to
   `plan-ready`.
3. Review the Human Review Summary first, then inspect Teach Me, Decisions the
   Reviewer Should Challenge, and Machine Implementation Details. Request
   revisions with `changes-requested`, or approve the complete documented scope
   with `approved-for-build`.
4. Implement manually on a non-reserved branch, or separately authorize Codex
   by applying `approved-for-ai-build`.
5. Review the draft pull request, checks, security boundaries, and visual
   result. Only a human merges.

Automation may propose splitting an oversized issue. A human must apply
`approved-for-split` before the GitHub-only publisher creates child issues.

When planning applies `needs-decision`, record the chosen direction in a
trusted issue comment, remove `needs-decision`, and apply `needs-planning` so a
new structured plan can incorporate the decision. A model-generated question
or recommendation is advisory and never selects an option or grants approval.

The Human Review Summary contains the objective, executive summary, key
decisions, tradeoffs, risks, open questions, file impacts, and ordered
implementation sequence. Empty optional sections are intentional, not missing
output. Teach Me explains issue-specific concepts and why the selected approach
fits better than obvious alternatives. Reviewer challenge points identify only
material decisions; an empty section must not be padded with generic concerns.
Machine Implementation Details are instructions for implementation, not a
substitute for reviewing and approving the human summary.

If an automated implementation is blocked by an authorization refusal, fix the
underlying trusted-state or authorization cause before retrying. Then remove
`blocked` and reapply `approved-for-ai-build`. The general
`approved-for-build` label does not trigger or retry automation, and neither
approval gate should be bypassed or weakened.

## Security boundaries

Treat issue and comment text as untrusted. Never place credentials, client
data, production identifiers, or confidential operational details in issues,
comments, logs, artifacts, or prompts. Supabase service credentials and other
provider secrets remain server-side.

The Codex generation job has no GitHub write credential. A separate trusted
publisher validates artifacts and uses a short-lived, repository-scoped GitHub
App token to create branches and draft pull requests. Automation never merges,
deploys, releases, or applies human approval labels.

## Local implementation

Use the repository-local `implement-approved-issue` skill for an approved issue.
Publishing requires separate, explicit permission. Run:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

See [GitHub change workflow](docs/github-change-workflow.md) for label meanings,
failure recovery, and automation configuration.
