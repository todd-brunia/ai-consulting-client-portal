# Repository Instructions

## Purpose

This private learning repository explores the client portal architecture in
`ai-consulting-meta/plans/client-portal/revised-plan.md`. Keep the application
a thin collaboration layer around managed services.

## Technical Stack

- Next.js App Router and TypeScript
- Tailwind CSS
- Supabase PostgreSQL, Auth, and Storage
- JSON:API route handlers
- Vitest and React Testing Library
- GitHub Actions

## Before Changing Code

1. Read `README.md` and the relevant architecture guidance.
2. Confirm that every tracked-file change has an originating issue; there is
   no small-change bypass for dependencies, documentation, CI, or policy.
3. Confirm that the issue has a marked plan and `approved-for-build`.
4. AI implementation also requires `approved-for-ai-build`.
5. Do not implement while `needs-decision`, `split-proposed`,
   `approved-for-split`, or `split-parent` is present.

Manual implementation uses a non-reserved branch and linked draft pull
request. Reserve `codex/issue-<number>` branches for label automation. For
local interactive implementation, use the repository-local
`implement-approved-issue` skill; implementation permission does not imply
permission to push, open a pull request, comment, or change labels.

## Engineering Principles

- Prefer a simple Next.js monolith with clear domain and provider boundaries.
- Keep JSON:API serialization at the HTTP boundary.
- Enforce organization authorization on the server; RLS is defense in depth.
- Never expose service-role credentials to browser code.
- Keep generated content separate from approved external actions.
- Do not add hosted Vercel or Supabase configuration until it is approved.
- Keep the Bruno collection, environments, configuration, tests, and
  documentation synchronized whenever application API routes, authentication,
  authorization, headers, media types, request or response schemas, error
  behavior, fixtures, or local API-testing prerequisites change.

## Required Validation

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Pull Request Requirements

Include the outcome, originating issue, validation, accessibility impact,
documentation impact, and known limitations. Never push directly to or merge
into `main`. Only a human may approve the plan, approve the result, and merge.
