-- Staff invitation lifecycle operations use row and advisory transaction locks
-- so duplicate issuance and competing mutations have one deterministic winner.

create function private.invitation_status(
  invitation public.organization_invitations
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when invitation.consumed_at is not null then 'consumed'
    when invitation.revoked_at is not null then 'revoked'
    when invitation.replaced_at is not null then 'replaced'
    when invitation.expires_at <= now() then 'expired'
    else 'pending'
  end
$$;

create function private.safe_invitation_json(
  invitation public.organization_invitations
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', invitation.id,
    'organization_id', invitation.organization_id,
    'organization_name', organization.name,
    'invited_email', invitation.invited_email,
    'role', invitation.role,
    'status', private.invitation_status(invitation),
    'created_at', invitation.created_at,
    'expires_at', invitation.expires_at,
    'consumed_at', invitation.consumed_at,
    'revoked_at', invitation.revoked_at,
    'replaced_at', invitation.replaced_at,
    'replacement_invitation_id', invitation.replacement_invitation_id,
    'invited_by_application_user_id',
      invitation.invited_by_application_user_id,
    'invited_by_email', inviter.email
  )
  from public.organizations organization
  join public.application_users inviter
    on inviter.id = invitation.invited_by_application_user_id
  where organization.id = invitation.organization_id
$$;

create function public.has_staff_admin_authority()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff_admin()
$$;

create function public.staff_issue_organization_invitation(
  target_organization_id uuid,
  normalized_email text,
  invitation_token_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  inviter_id uuid;
  invitation_record public.organization_invitations%rowtype;
begin
  if not private.is_staff_admin() then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if normalized_email is null
    or normalized_email <> lower(btrim(normalized_email))
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or invitation_token_hash !~ '^[a-f0-9]{64}$'
  then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  if not exists (
    select 1 from public.organizations
    where id = target_organization_id
  ) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  inviter_id := private.current_application_user_id();
  perform pg_advisory_xact_lock(
    hashtextextended(target_organization_id::text || ':' || normalized_email, 0)
  );

  if exists (
    select 1
    from public.organization_invitations invitation
    where invitation.organization_id = target_organization_id
      and invitation.invited_email = normalized_email
      and invitation.consumed_at is null
      and invitation.revoked_at is null
      and invitation.replaced_at is null
      and invitation.expires_at > now()
  ) then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  insert into public.organization_invitations (
    organization_id,
    invited_by_application_user_id,
    invited_email,
    token_hash,
    expires_at
  )
  values (
    target_organization_id,
    inviter_id,
    normalized_email,
    invitation_token_hash,
    now() + interval '72 hours'
  )
  returning * into invitation_record;

  return jsonb_build_object(
    'outcome', 'created',
    'invitation', private.safe_invitation_json(invitation_record)
  );
end;
$$;

create function public.staff_revoke_organization_invitation(
  target_invitation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  invitation_record public.organization_invitations%rowtype;
begin
  if not private.is_staff_admin() then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  select invitation.*
  into invitation_record
  from public.organization_invitations invitation
  where invitation.id = target_invitation_id
  for update;

  if invitation_record.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if invitation_record.revoked_at is not null then
    return jsonb_build_object(
      'outcome', 'revoked',
      'invitation', private.safe_invitation_json(invitation_record)
    );
  end if;

  if private.invitation_status(invitation_record) <> 'pending' then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  update public.organization_invitations
  set revoked_at = now()
  where id = invitation_record.id
  returning * into invitation_record;

  return jsonb_build_object(
    'outcome', 'revoked',
    'invitation', private.safe_invitation_json(invitation_record)
  );
end;
$$;

create function public.staff_replace_organization_invitation(
  target_invitation_id uuid,
  replacement_token_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  invitation_record public.organization_invitations%rowtype;
  replacement_record public.organization_invitations%rowtype;
begin
  if not private.is_staff_admin() then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if replacement_token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  select invitation.*
  into invitation_record
  from public.organization_invitations invitation
  where invitation.id = target_invitation_id
  for update;

  if invitation_record.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if private.invitation_status(invitation_record) <> 'pending' then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      invitation_record.organization_id::text
        || ':' || invitation_record.invited_email,
      0
    )
  );

  insert into public.organization_invitations (
    organization_id,
    invited_by_application_user_id,
    invited_email,
    role,
    token_hash,
    expires_at
  )
  values (
    invitation_record.organization_id,
    private.current_application_user_id(),
    invitation_record.invited_email,
    invitation_record.role,
    replacement_token_hash,
    now() + interval '72 hours'
  )
  returning * into replacement_record;

  update public.organization_invitations
  set
    replaced_at = now(),
    replacement_invitation_id = replacement_record.id
  where id = invitation_record.id
    and consumed_at is null
    and revoked_at is null
    and replaced_at is null;

  if not found then
    raise exception 'invitation lifecycle conflict';
  end if;

  return jsonb_build_object(
    'outcome', 'replaced',
    'invitation', private.safe_invitation_json(replacement_record),
    'replaced_invitation_id', invitation_record.id
  );
end;
$$;

revoke all on function private.invitation_status(public.organization_invitations) from public;
revoke all on function private.safe_invitation_json(public.organization_invitations) from public;
revoke all on function public.has_staff_admin_authority() from public;
revoke all on function public.staff_issue_organization_invitation(uuid, text, text) from public;
revoke all on function public.staff_revoke_organization_invitation(uuid) from public;
revoke all on function public.staff_replace_organization_invitation(uuid, text) from public;

grant execute on function public.has_staff_admin_authority() to authenticated;
grant execute on function public.staff_issue_organization_invitation(uuid, text, text) to authenticated;
grant execute on function public.staff_revoke_organization_invitation(uuid) to authenticated;
grant execute on function public.staff_replace_organization_invitation(uuid, text) to authenticated;
