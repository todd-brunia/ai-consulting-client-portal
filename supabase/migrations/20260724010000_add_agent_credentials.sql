create table public.agent_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.agent_credentials (
  id uuid primary key default gen_random_uuid(),
  agent_integration_id uuid not null references public.agent_integrations(id) on delete cascade,
  lookup_prefix text not null unique check (lookup_prefix ~ '^[a-f0-9]{16}$'),
  secret_hash text not null check (char_length(secret_hash) between 80 and 512),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check (last_used_at is null or last_used_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create table public.agent_capabilities (
  agent_integration_id uuid not null references public.agent_integrations(id) on delete cascade,
  capability text not null check (capability in ('engagements:read')),
  created_at timestamptz not null default now(),
  primary key (agent_integration_id, capability)
);

create table public.agent_organization_grants (
  agent_integration_id uuid not null references public.agent_integrations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_integration_id, organization_id)
);

create table public.agent_engagement_grants (
  agent_integration_id uuid not null references public.agent_integrations(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_integration_id, engagement_id)
);

create index agent_credentials_integration_idx
on public.agent_credentials (agent_integration_id);

create index agent_organization_grants_organization_idx
on public.agent_organization_grants (organization_id);

create index agent_engagement_grants_engagement_idx
on public.agent_engagement_grants (engagement_id);

alter table public.agent_integrations enable row level security;
alter table public.agent_credentials enable row level security;
alter table public.agent_capabilities enable row level security;
alter table public.agent_organization_grants enable row level security;
alter table public.agent_engagement_grants enable row level security;

revoke all on table public.agent_integrations from anon, authenticated;
revoke all on table public.agent_credentials from anon, authenticated;
revoke all on table public.agent_capabilities from anon, authenticated;
revoke all on table public.agent_organization_grants from anon, authenticated;
revoke all on table public.agent_engagement_grants from anon, authenticated;

comment on table public.agent_integrations is
  'Named machine principals; never human or Supabase Auth identities.';
comment on column public.agent_credentials.lookup_prefix is
  'Non-secret prefix used only to locate a credential candidate.';
comment on column public.agent_credentials.secret_hash is
  'One-way scrypt verification value. The API key is never persisted.';
