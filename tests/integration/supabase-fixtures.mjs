import { createClient } from "@supabase/supabase-js";

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
  const { data: membership, error: membershipError } = await admin
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .single();

  if (membershipError) {
    throw new Error(
      `Could not resolve ${fixture.key} membership: ${membershipError.message}`,
    );
  }

  const organizationId = membership.organization_id;
  const { error: organizationError } = await admin
    .from("organizations")
    .update({ name: fixture.organizationName })
    .eq("id", organizationId);

  if (organizationError) {
    throw new Error(
      `Could not name ${fixture.key} organization: ${organizationError.message}`,
    );
  }

  const { data: engagement, error: engagementError } = await admin
    .from("engagements")
    .update({ name: fixture.engagementName })
    .eq("organization_id", organizationId)
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
    organizationId,
    engagementId: engagement.id,
  };
}

export async function provisionIntegrationFixtures({ apiUrl, serviceRoleKey }) {
  if (!apiUrl || !serviceRoleKey) {
    throw new Error("Local Supabase API URL and service-role key are required");
  }

  const admin = createAdminClient(apiUrl, serviceRoleKey);
  const provisioned = [];

  for (const fixture of tenantFixtures) {
    provisioned.push(await provisionTenant(admin, fixture));
  }

  return Object.fromEntries(
    provisioned.map((fixture) => [fixture.key, fixture]),
  );
}
