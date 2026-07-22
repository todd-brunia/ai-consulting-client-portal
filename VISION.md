# Client Portal Vision

## Purpose

This repository is a private, local-first learning scaffold for exploring a
client portal architecture. It demonstrates a small, understandable
collaboration layer where clients can access organization-scoped engagement
information without turning the portal into a transaction system or a broad
business platform.

## Audience

The immediate audience is the team learning, reviewing, and evolving the
architecture. The scaffold also represents the foundations of a future client
workspace: people who belong to an organization and need a clear view of their
engagements with the consulting team.

## Positioning

The portal is intentionally a thin application over managed services. Next.js
owns the application experience and server-side authorization boundary;
Supabase provides PostgreSQL, authentication, and storage capabilities. The
browser uses Supabase only for the authentication protocol. Application data
flows through server-rendered routes or versioned JSON:API endpoints, where
server-side organization authorization and PostgreSQL row-level security work
together.

## Goals

- Make tenant-aware organization and engagement access easy to inspect locally.
- Keep provider responsibilities explicit instead of recreating managed-service
  capabilities in application code.
- Demonstrate server-enforced organization authorization, with row-level
  security as defense in depth.
- Keep JSON:API serialization at the HTTP boundary so application and transport
  concerns stay separate.
- Provide a small, testable foundation for informed future product decisions.

## Principles

- Prefer a simple Next.js monolith with clear domain and provider boundaries.
- Treat the portal as a collaboration surface, not the system of record for
  financial, contractual, or operational transactions.
- Keep credentials and service-role capabilities on the server; never expose
  them to browser code.
- Separate generated content from approved external actions.
- Add hosted infrastructure and new providers only through reviewed plans.

## Initial Experience

In the current local experience, a person can create an account, receive an
organization membership and sample engagement, sign in, and view the
organization-scoped workspace. The workspace illustrates the path from
authentication through tenant membership and row-level security to a reusable
JSON:API engagement resource.

This is a learning demonstration, not a production client onboarding or
service-delivery workflow.

## Explicit Exclusions

The current scope does not include:

- Production hosting, deployment configuration, or hosted Vercel or Supabase
  setup.
- Payment processing, invoicing, or other Stripe-backed transactions.
- Agreement-provider integrations or contract execution.
- AI workflows or automated external actions.
- Production readiness claims, client records, or operational credentials.

## Future Direction

Future work may build on the demonstrated organization boundary to support
additional collaboration needs when they have a reviewed product and technical
plan. Any expansion should preserve the thin-layer strategy: retain managed
providers for their appropriate responsibilities, enforce authorization on the
server, and introduce external actions only with explicit human approval.

Until then, this repository remains a private local environment for learning
and validating architectural choices rather than a deployed client portal.
