# AI Consulting Client Portal

A private, local-first learning scaffold for the architecture described in the
client portal revised plan. It is intentionally a thin collaboration shell,
not a production portal or transaction system.

## What is included

- Next.js App Router, TypeScript, Tailwind CSS
- Local Supabase PostgreSQL, Auth, Storage, Studio, and test email inbox
- Tenant-aware organizations, memberships, and engagements with RLS
- A server-rendered authenticated workspace
- A versioned JSON:API engagements endpoint
- Vitest, ESLint, type checking, builds, and GitHub Actions

## Run the full stack locally

Prerequisites: Node.js 24.18.0 (run `nvm use`) and a running Docker-compatible
container engine.

1. Install dependencies: `npm install`
2. Start Supabase: `npm run supabase:start`
3. Copy `.env.local.example` to `.env.local` and replace the publishable key
   with the value printed by `supabase start`.
4. Reset the local database: `npm run supabase:reset`
5. Start Next.js: `npm run dev`
6. Open `http://localhost:3000`, create a local account, and inspect the sample
   workspace. Local emails appear at `http://127.0.0.1:54324`.

No Vercel or hosted Supabase account is required. Stop local services with
`npm run supabase:stop`.

## Architecture boundaries

The browser uses Supabase only for the authentication protocol. Application
data passes through server-rendered routes or `/api/v1`, where server-side
authorization and PostgreSQL RLS both constrain access. JSON:API formatting is
kept at the HTTP boundary.

Stripe, agreement providers, production deployment, and AI workflows are
deliberately deferred.
