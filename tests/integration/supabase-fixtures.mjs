import { createClient } from "@supabase/supabase-js";
import { createHash, scryptSync } from "node:crypto";

const testPassword = "local-integration-only-password";

export const tenantFixtures = [
  {
    key: "tenantA",
    email: "tenant-a@portal.test",
    password: testPassword,
    organizationName: "Tenant A Test Organization",
    engagementName: "Tenant A Integration Engagement",
  },
  {
    key: "tenantB",
    email: "tenant-b@portal.test",
    password: testPassword,
    organizationName: "Tenant B Test Organization",
    engagementName: "Tenant B Integration Engagement",
  },
];

const lifecycleFixtures = {
  staff: {
    email: "staff-admin@portal.test",
    password: testPassword,
  },
  pendingClient: {
    email: "pending-client@portal.test",
    password: testPassword,
    status: "pending",
  },
  revokedClient: {
    email: "revoked-client@portal.test",
    password: testPassword,
    status: "revoked",
  },
};

function createAdminClient(apiUrl, serviceRoleKey) {
  return createClient(apiUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function provisionTenant(admin, fixture) {
  const { data: usersData, error: usersError } =
    await admin.auth.admin.listUsers({ perPage: 1000 });

  if (usersError) {
    throw new Error(
      `Could not inspect existing ${fixture.key} users: ${usersError.message}`,
    );
  }

  const existingUser = usersData.users.find(
    (user) => user.email === fixture.email,
  );

  if (existingUser) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(
      existingUser.id,
    );

    if (deleteError) {
      throw new Error(
        `Could not reset existing ${fixture.key} user: ${deleteError.message}`,
      );
    }
  }

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: fixture.email,
    password: fixture.password,
    email_confirm: true,
  });

  if (userError) {
    throw new Error(`Could not create ${fixture.key} user: ${userError.message}`);
  }

  const userId = userData.user.id;
  const { data: applicationUser, error: applicationUserError } = await admin
    .from("application_users")
    .select("id")
    .eq("auth_user_id", userId)
    .single();

  if (applicationUserError) {
    throw new Error(
      `Could not resolve ${fixture.key} application user: ${applicationUserError.message}`,
    );
  }

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .insert({ name: fixture.organizationName })
    .select("id")
    .single();

  if (organizationError) {
    throw new Error(
      `Could not create ${fixture.key} organization: ${organizationError.message}`,
    );
  }

  const organizationId = organization.id;
  const { error: membershipError } = await admin
    .from("organization_memberships")
    .insert({
      organization_id: organizationId,
      application_user_id: applicationUser.id,
      role: "client_member",
      status: "active",
      activated_at: "2026-01-01T00:00:00.000Z",
    });

  if (membershipError) {
    throw new Error(
      `Could not create ${fixture.key} membership: ${membershipError.message}`,
    );
  }

  const { data: engagement, error: engagementError } = await admin
    .from("engagements")
    .insert({
      organization_id: organizationId,
      name: fixture.engagementName,
    })
    .select("id")
    .single();

  if (engagementError) {
    throw new Error(
      `Could not name ${fixture.key} engagement: ${engagementError.message}`,
    );
  }

  return {
    ...fixture,
    userId,
    applicationUserId: applicationUser.id,
    organizationId,
    engagementId: engagement.id,
  };
}

async function provisionLifecycleFixtures(admin, tenant) {
  const provisioned = {};
  const { error: invitationCleanupError } = await admin
    .from("organization_invitations")
    .delete()
    .eq("invited_email", lifecycleFixtures.pendingClient.email);
  if (invitationCleanupError) {
    throw new Error(
      `Could not reset invitation fixture: ${invitationCleanupError.message}`,
    );
  }

  for (const [key, fixture] of Object.entries(lifecycleFixtures)) {
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers(
      { perPage: 1000 },
    );
    if (usersError) {
      throw new Error(`Could not inspect ${key}: ${usersError.message}`);
    }
    const existingUser = usersData.users.find(
      (user) => user.email === fixture.email,
    );
    if (existingUser) {
      const { error } = await admin.auth.admin.deleteUser(existingUser.id);
      if (error) throw new Error(`Could not reset ${key}: ${error.message}`);
    }

    const { data: userData, error: userError } =
      await admin.auth.admin.createUser({
        email: fixture.email,
        password: fixture.password,
        email_confirm: true,
      });
    if (userError) throw new Error(`Could not create ${key}: ${userError.message}`);

    const { data: applicationUser, error: applicationUserError } = await admin
      .from("application_users")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .single();
    if (applicationUserError) {
      throw new Error(
        `Could not resolve ${key} application user: ${applicationUserError.message}`,
      );
    }

    provisioned[key] = {
      ...fixture,
      userId: userData.user.id,
      applicationUserId: applicationUser.id,
    };
  }

  const { error: authorityError } = await admin
    .from("staff_authorities")
    .insert({
      application_user_id: provisioned.staff.applicationUserId,
      authority: "staff_admin",
    });
  if (authorityError) {
    throw new Error(`Could not create staff authority: ${authorityError.message}`);
  }

  for (const key of ["pendingClient", "revokedClient"]) {
    const fixture = provisioned[key];
    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .insert({ name: `${key} Test Organization` })
      .select("id")
      .single();
    if (organizationError) {
      throw new Error(
        `Could not create ${key} organization: ${organizationError.message}`,
      );
    }

    const membership = {
      organization_id: organization.id,
      application_user_id: fixture.applicationUserId,
      role: "client_member",
      status: fixture.status,
      ...(fixture.status === "revoked" ? { revoked_at: "2026-01-02T00:00:00.000Z" } : {}),
    };
    const { error: membershipError } = await admin
      .from("organization_memberships")
      .insert(membership);
    if (membershipError) {
      throw new Error(
        `Could not create ${key} membership: ${membershipError.message}`,
      );
    }
    fixture.organizationId = organization.id;
  }

  async function createInvitation(suffix, values = {}) {
    const tokenHash = createHash("sha256")
      .update(`local-integration-only-invitation-token:${suffix}`)
      .digest("hex");
    const { data, error } = await admin
      .from("organization_invitations")
      .insert({
        organization_id: provisioned.pendingClient.organizationId,
        invited_by_application_user_id: provisioned.staff.applicationUserId,
        invited_email: lifecycleFixtures.pendingClient.email,
        token_hash: tokenHash,
        created_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2099-01-01T00:00:00.000Z",
        ...values,
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(`Could not create ${suffix} invitation: ${error.message}`);
    }
    return data.id;
  }

  const invitationIds = {
    current: await createInvitation("current"),
    consumed: await createInvitation("consumed", {
      consumed_at: "2026-01-02T00:00:00.000Z",
      consumed_by_application_user_id:
        provisioned.pendingClient.applicationUserId,
    }),
    revoked: await createInvitation("revoked", {
      revoked_at: "2026-01-02T00:00:00.000Z",
    }),
    expired: await createInvitation("expired", {
      expires_at: "2020-01-02T00:00:00.000Z",
      created_at: "2020-01-01T00:00:00.000Z",
    }),
  };
  const replacedInvitationId = await createInvitation("replaced");
  const replacementInvitationId = await createInvitation("replacement");
  const { error: replacementError } = await admin
    .from("organization_invitations")
    .update({
      replaced_at: "2026-01-02T00:00:00.000Z",
      replacement_invitation_id: replacementInvitationId,
    })
    .eq("id", replacedInvitationId);
  if (replacementError) {
    throw new Error(
      `Could not establish replacement invitation fixture: ${replacementError.message}`,
    );
  }
  invitationIds.replaced = replacedInvitationId;
  invitationIds.replacement = replacementInvitationId;

  return {
    ...provisioned,
    invitationIds,
    otherOrganizationId: tenant.organizationId,
  };
}

async function provisionMachineIntegration(
  admin,
  fixture,
  {
    suffix = "allowed",
    capability = true,
    organizationGrant = true,
    engagementGrant = true,
    credentialStatus = "valid",
  } = {},
) {
  const integrationName =
    `${fixture.key} deterministic machine ${suffix}`;
  const { error: cleanupError } = await admin
    .from("agent_integrations")
    .delete()
    .eq("name", integrationName);

  if (cleanupError) {
    throw new Error(
      `Could not reset ${fixture.key} machine integration: ${cleanupError.message}`,
    );
  }

  const { data: integration, error: integrationError } = await admin
    .from("agent_integrations")
    .insert({ name: integrationName })
    .select("id")
    .single();

  if (integrationError) {
    throw new Error(
      `Could not create ${fixture.key} machine integration: ${integrationError.message}`,
    );
  }

  const fixtureRows = [];
  if (capability) {
    fixtureRows.push(admin.from("agent_capabilities").insert({
      agent_integration_id: integration.id,
      capability: "engagements:read",
    }));
  }
  if (organizationGrant) {
    fixtureRows.push(admin.from("agent_organization_grants").insert({
      agent_integration_id: integration.id,
      organization_id: fixture.organizationId,
    }));
  }
  if (engagementGrant) {
    fixtureRows.push(admin.from("agent_engagement_grants").insert({
      agent_integration_id: integration.id,
      engagement_id: fixture.engagementId,
    }));
  }
  const results = await Promise.all(fixtureRows);
  const fixtureError = results.find(({ error }) => error)?.error;

  if (fixtureError) {
    throw new Error(
      `Could not grant ${fixture.key} machine access: ${fixtureError.message}`,
    );
  }

  const lookupPrefix = createHash("sha256")
    .update(`${integrationName}:lookup`)
    .digest("hex")
    .slice(0, 16);
  const secret = createHash("sha256")
    .update(`${integrationName}:secret`)
    .digest("base64url");
  const apiKey = `portal_agent_${lookupPrefix}_${secret}`;
  const salt = createHash("sha256")
    .update(`${integrationName}:salt`)
    .digest("base64url");
  const derivedKey = scryptSync(apiKey, salt, 32, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
  const secretHash = [
    "scrypt",
    16_384,
    8,
    1,
    salt,
    derivedKey.toString("base64url"),
  ].join("$");
  const createdAt =
    credentialStatus === "expired"
      ? "2020-01-01T00:00:00.000Z"
      : "2026-01-01T00:00:00.000Z";
  const expiresAt =
    credentialStatus === "expired"
      ? "2020-01-02T00:00:00.000Z"
      : "2099-01-01T00:00:00.000Z";
  const revokedAt =
    credentialStatus === "revoked"
      ? "2026-01-02T00:00:00.000Z"
      : null;
  const { error: credentialError } = await admin
    .from("agent_credentials")
    .insert({
      agent_integration_id: integration.id,
      lookup_prefix: lookupPrefix,
      secret_hash: secretHash,
      created_at: createdAt,
      expires_at: expiresAt,
      revoked_at: revokedAt,
    });

  if (credentialError) {
    throw new Error(
      `Could not create ${fixture.key} machine credential: ${credentialError.message}`,
    );
  }

  return { integrationId: integration.id, apiKey };
}

export async function provisionIntegrationFixtures({ apiUrl, serviceRoleKey }) {
  if (!apiUrl || !serviceRoleKey) {
    throw new Error("Local Supabase API URL and service-role key are required");
  }

  const admin = createAdminClient(apiUrl, serviceRoleKey);
  const provisioned = [];

  for (const fixture of tenantFixtures) {
    const tenant = await provisionTenant(admin, fixture);
    const allowedMachine = await provisionMachineIntegration(
      admin,
      tenant,
    );
    const machineWithoutCapability =
      await provisionMachineIntegration(admin, tenant, {
        suffix: "without capability",
        capability: false,
      });
    const machineWithoutOrganizationGrant =
      await provisionMachineIntegration(admin, tenant, {
        suffix: "without organization grant",
        organizationGrant: false,
      });
    const machineWithoutEngagementGrant =
      await provisionMachineIntegration(admin, tenant, {
        suffix: "without engagement grant",
        engagementGrant: false,
      });
    const revokedMachine = await provisionMachineIntegration(
      admin,
      tenant,
      {
        suffix: "revoked credential",
        credentialStatus: "revoked",
      },
    );
    const expiredMachine = await provisionMachineIntegration(
      admin,
      tenant,
      {
        suffix: "expired credential",
        credentialStatus: "expired",
      },
    );
    provisioned.push({
      ...tenant,
      machineIntegrationId: allowedMachine.integrationId,
      machineApiKey: allowedMachine.apiKey,
      machineWithoutCapabilityId:
        machineWithoutCapability.integrationId,
      machineWithoutCapabilityApiKey:
        machineWithoutCapability.apiKey,
      machineWithoutOrganizationGrantId:
        machineWithoutOrganizationGrant.integrationId,
      machineWithoutOrganizationGrantApiKey:
        machineWithoutOrganizationGrant.apiKey,
      machineWithoutEngagementGrantId:
        machineWithoutEngagementGrant.integrationId,
      machineWithoutEngagementGrantApiKey:
        machineWithoutEngagementGrant.apiKey,
      revokedMachineApiKey: revokedMachine.apiKey,
      expiredMachineApiKey: expiredMachine.apiKey,
    });
  }

  const lifecycle = await provisionLifecycleFixtures(admin, provisioned[0]);

  return {
    ...Object.fromEntries(provisioned.map((fixture) => [fixture.key, fixture])),
    lifecycle,
  };
}
