-- The server-only machine-authentication adapter uses the project secret to
-- verify portal credentials and resolve current authorization snapshots.
-- Engagement reads never use this role; they use portal_machine with RLS.
grant select, insert, delete on table public.agent_credentials
to service_role;
grant update (last_used_at) on table public.agent_credentials
to service_role;

grant select on table public.agent_integrations to service_role;
grant select on table public.agent_capabilities to service_role;
grant select on table public.agent_organization_grants to service_role;
grant select on table public.agent_engagement_grants to service_role;
