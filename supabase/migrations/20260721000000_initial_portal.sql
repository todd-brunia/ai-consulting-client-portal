create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  status text not null default 'exploring' check (status in ('exploring', 'active', 'complete')),
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.engagements enable row level security;

create policy "members read their organizations" on public.organizations for select to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id = id and m.user_id = auth.uid()));
create policy "members read their memberships" on public.organization_memberships for select to authenticated
using (user_id = auth.uid());
create policy "members read their engagements" on public.engagements for select to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id = engagements.organization_id and m.user_id = auth.uid()));

create function public.create_personal_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
declare organization_id uuid;
begin
  insert into public.organizations (name) values (split_part(new.email, '@', 1) || '''s workspace') returning id into organization_id;
  insert into public.organization_memberships (organization_id, user_id, role) values (organization_id, new.id, 'owner');
  insert into public.engagements (organization_id, name) values (organization_id, 'Explore the client portal');
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.create_personal_workspace();
