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

## Engineering Principles

- Prefer a simple Next.js monolith with clear domain and provider boundaries.
- Keep JSON:API serialization at the HTTP boundary.
- Enforce organization authorization on the server; RLS is defense in depth.
- Never expose service-role credentials to browser code.
- Keep generated content separate from approved external actions.
- Do not add hosted Vercel or Supabase configuration until it is approved.

## Required Validation

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
