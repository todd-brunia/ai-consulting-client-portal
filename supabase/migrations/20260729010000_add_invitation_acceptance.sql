-- Authenticated invitation acceptance is intentionally narrow: the caller must
-- already have an application identity and a matching pending membership.

alter table public.organization_invitations
  add column consumed_by_application_user_id uuid
    references public.application_users(id) on delete restrict;

alter table public.organization_invitations
  add constraint organization_invitations_consumption_identity_check check (
    (consumed_at is null and consumed_by_application_user_id is null)
    or (consumed_at is not null and consumed_by_application_user_id is not null)
  );

create function public.accept_organization_invitation(invitation_token_hash text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_record public.application_users%rowtype;
  invitation_record public.organization_invitations%rowtype;
begin
  if invitation_token_hash is null
    or invitation_token_hash !~ '^[a-f0-9]{64}$'
  then
    return 'unavailable';
  end if;

  select application_user.*
  into current_user_record
  from public.application_users application_user
  where application_user.auth_user_id = auth.uid();

  if current_user_record.id is null then
    return 'unavailable';
  end if;

  select invitation.*
  into invitation_record
  from public.organization_invitations invitation
  where invitation.token_hash = invitation_token_hash
  for update;

  if invitation_record.id is null then
    return 'unavailable';
  end if;

  if invitation_record.consumed_at is not null then
    if invitation_record.consumed_by_application_user_id = current_user_record.id
      and exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = invitation_record.organization_id
          and membership.application_user_id = current_user_record.id
          and membership.role = 'client_member'
          and membership.status = 'active'
      )
    then
      return 'already_accepted';
    end if;

    return 'unavailable';
  end if;

  if invitation_record.expires_at <= now()
    or invitation_record.revoked_at is not null
    or invitation_record.replaced_at is not null
    or invitation_record.invited_email <> current_user_record.email
  then
    return 'unavailable';
  end if;

  update public.organization_memberships
  set
    status = 'active',
    activated_at = now(),
    revoked_at = null
  where organization_id = invitation_record.organization_id
    and application_user_id = current_user_record.id
    and role = 'client_member'
    and status = 'pending';

  if not found then
    return 'unavailable';
  end if;

  update public.organization_invitations
  set
    consumed_at = now(),
    consumed_by_application_user_id = current_user_record.id
  where id = invitation_record.id;

  return 'accepted';
end;
$$;

revoke all on function public.accept_organization_invitation(text) from public;
grant execute on function public.accept_organization_invitation(text) to authenticated;

comment on function public.accept_organization_invitation(text) is
  'Atomically consumes a valid invitation hash and activates only its matching pending client membership.';
comment on column public.organization_invitations.consumed_by_application_user_id is
  'Identity that consumed the invitation, retained to permit safe idempotent acceptance.';
