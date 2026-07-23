-- The server-only service role provisions deterministic local and CI fixtures.
-- Tenant-access assertions continue to use authenticated clients and RLS.
grant select, update on table public.organizations to service_role;
grant select on table public.organization_memberships to service_role;
grant select, update on table public.engagements to service_role;
