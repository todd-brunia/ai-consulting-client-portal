import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tenantFixtures } from "./supabase-fixtures.mjs";

const apiUrl = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const fixtureIdentities = JSON.parse(
  process.env.SUPABASE_TEST_FIXTURES ?? "{}",
);

if (!apiUrl || !anonKey) {
  throw new Error(
    "Run these tests with `npm run test:integration:rls` against local Supabase.",
  );
}

function createAuthenticatedClient() {
  return createClient(apiUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const machineSecurityTables = [
  "agent_integrations",
  "agent_credentials",
  "agent_capabilities",
  "agent_organization_grants",
  "agent_engagement_grants",
];

test("does not expose service-role credentials to tenant assertions", () => {
  expect(process.env.SERVICE_ROLE_KEY).toBeUndefined();
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  expect(process.env.SUPABASE_SECRET_KEY).toBeUndefined();
});

describe.each(tenantFixtures)("$key PostgreSQL tenant isolation", (fixture) => {
  const otherFixture = tenantFixtures.find(
    (candidate) => candidate.key !== fixture.key,
  );
  const identity = fixtureIdentities[fixture.key];
  const otherIdentity = fixtureIdentities[otherFixture.key];
  const client = createAuthenticatedClient();

  beforeAll(async () => {
    if (!identity || !otherIdentity) {
      throw new Error("Integration fixture identities are incomplete");
    }

    const { error } = await client.auth.signInWithPassword({
      email: fixture.email,
      password: fixture.password,
    });

    expect(error).toBeNull();
  });

  afterAll(async () => {
    await client.auth.signOut();
  });

  test("reads only its organization", async () => {
    const { data: ownRows, error: ownError } = await client
      .from("organizations")
      .select("id, name")
      .eq("id", identity.organizationId);
    const { data: otherRows, error: otherError } = await client
      .from("organizations")
      .select("id, name")
      .eq("id", otherIdentity.organizationId);

    expect(ownError).toBeNull();
    expect(ownRows).toEqual([
      { id: identity.organizationId, name: fixture.organizationName },
    ]);
    expect(otherError).toBeNull();
    expect(otherRows).toEqual([]);
  });

  test("reads only its membership", async () => {
    const { data: ownRows, error: ownError } = await client
      .from("organization_memberships")
      .select("organization_id, user_id, role")
      .eq("organization_id", identity.organizationId);
    const { data: otherRows, error: otherError } = await client
      .from("organization_memberships")
      .select("organization_id, user_id, role")
      .eq("organization_id", otherIdentity.organizationId);

    expect(ownError).toBeNull();
    expect(ownRows).toEqual([
      {
        organization_id: identity.organizationId,
        user_id: identity.userId,
        role: "owner",
      },
    ]);
    expect(otherError).toBeNull();
    expect(otherRows).toEqual([]);
  });

  test("reads only its engagement", async () => {
    const { data: ownRows, error: ownError } = await client
      .from("engagements")
      .select("id, organization_id, name, status")
      .eq("id", identity.engagementId);
    const { data: otherRows, error: otherError } = await client
      .from("engagements")
      .select("id, organization_id, name, status")
      .eq("id", otherIdentity.engagementId);

    expect(ownError).toBeNull();
    expect(ownRows).toEqual([
      {
        id: identity.engagementId,
        organization_id: identity.organizationId,
        name: fixture.engagementName,
        status: "exploring",
      },
    ]);
    expect(otherError).toBeNull();
    expect(otherRows).toEqual([]);
  });

  test.each(machineSecurityTables)(
    "cannot read protected machine table %s",
    async (table) => {
      const { data, error } = await client.from(table).select("*");

      expect(data).toBeNull();
      expect(error?.message).toMatch(/permission denied/i);
    },
  );
});
