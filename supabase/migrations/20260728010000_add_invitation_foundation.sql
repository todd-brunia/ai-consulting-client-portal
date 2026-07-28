-- Invitation-only onboarding foundation. This migration intentionally stores
-- lifecycle state only; issuing and accepting invitations remain server-side
-- work for a later approved change.

create table public.application_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- Preserve existing local users while separating application identity from the
-- Supabase Auth identity that authenticated them.
insert into public.application_users (auth_user_id, email, created_at)
select id, lower(email), created_at
from auth.users
where email is not null;

alter table public.organization_memberships
  add column application_user_id uuid;

update public.organization_memberships membership
set application_user_id = application_user.id
from public.application_users application_user
where application_user.auth_user_id = membership.user_id;

alter table public.organization_memberships
  drop constraint organization_memberships_pkey,
  drop constraint organization_memberships_user_id_fkey,
  drop constraint organization_memberships_role_check;

update public.organization_memberships
set role = 'client_member';

alter table public.organization_memberships
  drop column user_id,
  alter column application_user_id set not null,
  add constraint organization_memberships_application_user_id_fkey
    foreign key (application_user_id) references public.application_users(id)
    on delete cascade,
  add constraint organization_memberships_pkey
    primary key (organization_id, application_user_id),
  add constraint organization_memberships_role_check
    check (role in ('client_member')),
  add column status text not null default 'active'
    check (status in ('pending', 'active', 'revoked')),
  add column activated_at timestamptz,
  add column revoked_at timestamptz;

update public.organization_memberships
set activated_at = created_at;

alter table public.organization_memberships
  add constraint organization_memberships_lifecycle_check check (
    (status = 'pending' and activated_at is null and revoked_at is null)
    or (status = 'active' and activated_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  );

create table public.staff_authorities (
  application_user_id uuid primary key
    references public.application_users(id) on delete cascade,
  authority text not null check (authority in ('staff_admin')),
  granted_at timestamptz not null default now()
);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invited_by_application_user_id uuid not null
    references public.application_users(id) on delete restrict,
  invited_email text not null check (invited_email = lower(invited_email)),
  role text not null default 'client_member' check (role in ('client_member')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  replaced_at timestamptz,
  replacement_invitation_id uuid unique
    references public.organization_invitations(id) on delete restrict,
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at),
  check (replaced_at is null or replaced_at >= created_at),
  check (
    (replaced_at is null and replacement_invitation_id is null)
    or (replaced_at is not null and replacement_invitation_id is not null)
  ),
  check (
    num_nonnulls(consumed_at, revoked_at, replaced_at) <= 1
  )
);

create index organization_memberships_active_user_idx
on public.organization_memberships (application_user_id, organization_id)
where status = 'active';

create index organization_invitations_organization_idx
on public.organization_invitations (organization_id);

create index organization_invitations_invited_email_idx
on public.organization_invitations (invited_email);

create schema if not exists private;
revoke all on schema private from public;

create function private.current_application_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select application_user.id
  from public.application_users application_user
  where application_user.auth_user_id = auth.uid()
$$;

create function private.has_active_organization_membership(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.application_user_id = private.current_application_user_id()
      and membership.status = 'active'
  )
$$;

create function private.is_staff_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_authorities authority
    where authority.application_user_id = private.current_application_user_id()
      and authority.authority = 'staff_admin'
  )
$$;

revoke all on function private.current_application_user_id() from public;
revoke all on function private.has_active_organization_membership(uuid) from public;
revoke all on function private.is_staff_admin() from public;
grant execute on function private.current_application_user_id() to authenticated;
grant execute on function private.has_active_organization_membership(uuid) to authenticated;
grant execute on function private.is_staff_admin() to authenticated;

drop policy "members read their organizations" on public.organizations;
drop policy "members read their memberships" on public.organization_memberships;
drop policy "members read their engagements" on public.engagements;

create policy "active members or staff read organizations"
on public.organizations for select to authenticated
using (
  private.is_staff_admin()
  or private.has_active_organization_membership(id)
);

create policy "active members or staff read memberships"
on public.organization_memberships for select to authenticated
using (
  private.is_staff_admin()
  or (
    application_user_id = private.current_application_user_id()
    and status = 'active'
  )
);

create policy "active members or staff read engagements"
on public.engagements for select to authenticated
using (
  private.is_staff_admin()
  or private.has_active_organization_membership(organization_id)
);

alter table public.application_users enable row level security;
alter table public.staff_authorities enable row level security;
alter table public.organization_invitations enable row level security;

create policy "users read their application identity"
on public.application_users for select to authenticated
using (auth_user_id = auth.uid());

create policy "staff read invitation records"
on public.organization_invitations for select to authenticated
using (private.is_staff_admin());

grant select on table public.application_users to authenticated;
grant select on table public.organization_invitations to authenticated;
grant select, insert, update, delete on table public.application_users to service_role;
grant select, insert, update, delete on table public.staff_authorities to service_role;
grant select, insert, update, delete on table public.organization_memberships to service_role;
grant select, insert, update, delete on table public.organization_invitations to service_role;
grant insert, delete on table public.organizations to service_role;
grant insert, delete on table public.engagements to service_role;

drop trigger on_auth_user_created on auth.users;
drop function public.create_personal_workspace();

create function public.create_application_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    raise exception 'Application users require an email address';
  end if;

  insert into public.application_users (auth_user_id, email)
  values (new.id, lower(new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.create_application_user();

comment on table public.application_users is
  'Stable portal identity mapped one-to-one to a Supabase Auth user.';
comment on table public.staff_authorities is
  'Independent staff authority. Organization membership never grants staff access.';
comment on table public.organization_memberships is
  'Client organization access lifecycle; only active memberships receive tenant RLS access.';
comment on table public.organization_invitations is
  'Invitation lifecycle record. Only a SHA-256 hash of an opaque token is persisted.';
comment on column public.organization_invitations.replacement_invitation_id is
  'Replacement relationship; a replaced invitation is no longer consumable.';
