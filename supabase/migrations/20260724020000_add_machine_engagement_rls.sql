do $$
begin
  if not exists (
    select 1 from pg_roles where rolname = 'portal_machine'
  ) then
    create role portal_machine nologin noinherit nobypassrls;
  end if;
end
$$;

grant portal_machine to authenticator;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to portal_machine;

create function private.machine_can_read_engagement(
  target_engagement_id uuid,
  target_organization_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.jwt() ->> 'role' = 'portal_machine'
    and auth.jwt() ->> 'iss' = 'ai-consulting-client-portal'
    and auth.jwt() ->> 'aud' = 'supabase-data-api'
    and case
      when coalesce((auth.jwt() ->> 'exp') ~ '^[0-9]+$', false)
        then (auth.jwt() ->> 'exp')::numeric > extract(epoch from now())
      else false
    end
    and case
      when coalesce(
        (auth.jwt() ->> 'machine_integration_id')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        false
      )
        then true
      else false
    end
    and exists (
      select 1
      from public.agent_integrations integration
      join public.agent_capabilities capability
        on capability.agent_integration_id = integration.id
       and capability.capability = 'engagements:read'
      join public.agent_organization_grants organization_grant
        on organization_grant.agent_integration_id = integration.id
       and organization_grant.organization_id = target_organization_id
      join public.agent_engagement_grants engagement_grant
        on engagement_grant.agent_integration_id = integration.id
       and engagement_grant.engagement_id = target_engagement_id
      where integration.id = case
        when coalesce(
          (auth.jwt() ->> 'machine_integration_id')
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          false
        )
          then (auth.jwt() ->> 'machine_integration_id')::uuid
        else null
      end
    );
$$;

create function private.machine_can_read_organization(
  target_organization_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.engagements engagement
    where engagement.organization_id = target_organization_id
      and private.machine_can_read_engagement(
        engagement.id,
        target_organization_id
      )
  );
$$;

revoke all on function private.machine_can_read_engagement(uuid, uuid)
from public;
revoke all on function private.machine_can_read_organization(uuid)
from public;
grant execute on function private.machine_can_read_engagement(uuid, uuid)
to portal_machine;
grant execute on function private.machine_can_read_organization(uuid)
to portal_machine;

grant select on table public.engagements to portal_machine;
grant select on table public.organizations to portal_machine;

-- The existing server-only service role provisions deterministic local and CI
-- fixtures. Machine callers never receive this role or credential.
grant select, insert, delete on table public.agent_integrations
to service_role;
grant select, insert, delete on table public.agent_capabilities
to service_role;
grant select, insert, delete on table public.agent_organization_grants
to service_role;
grant select, insert, delete on table public.agent_engagement_grants
to service_role;

create policy "machines read granted engagements"
on public.engagements
for select
to portal_machine
using (
  private.machine_can_read_engagement(id, organization_id)
);

create policy "machines read organizations for granted engagements"
on public.organizations
for select
to portal_machine
using (
  private.machine_can_read_organization(id)
);

comment on role portal_machine is
  'Read-only Data API role for short-lived, server-minted machine JWTs.';
comment on function private.machine_can_read_engagement(uuid, uuid) is
  'RLS helper that validates trusted machine claims and joins current grants.';
