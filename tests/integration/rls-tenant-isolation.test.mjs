import { createClient } from "@supabase/supabase-js";
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  importJWK,
} from "jose";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tenantFixtures } from "./supabase-fixtures.mjs";

const apiUrl = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const fixtureIdentities = JSON.parse(
  process.env.SUPABASE_TEST_FIXTURES ?? "{}",
);
const machinePrivateJwk = JSON.parse(
  process.env.SUPABASE_TEST_MACHINE_PRIVATE_JWK ?? "null",
);

if (!apiUrl || !anonKey || !machinePrivateJwk) {
  throw new Error(
    "Run these tests with `npm run test:integration:rls` against local Supabase.",
  );
}

const machineIssuer = "ai-consulting-client-portal";
const machineAudience = "supabase-data-api";
const machineRole = "portal_machine";

function createAuthenticatedClient() {
  return createClient(apiUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createMachineClient(token) {
  return createClient(apiUrl, anonKey, {
    accessToken: async () => token,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function signMachineToken(
  integrationId,
  {
    privateJwk = machinePrivateJwk,
    algorithm = "ES256",
    issuer = machineIssuer,
    audience = machineAudience,
    role = machineRole,
    expiresInSeconds = 60,
    includeIntegration = true,
  } = {},
) {
  const key = await importJWK(
    { ...privateJwk, key_ops: ["sign"] },
    algorithm,
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = { role };
  if (includeIntegration) {
    payload.machine_integration_id = integrationId;
  }

  return new SignJWT(payload)
    .setProtectedHeader({
      alg: algorithm,
      kid: privateJwk.kid,
      typ: "JWT",
    })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(key);
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
      .select("organization_id, application_user_id, role, status")
      .eq("organization_id", identity.organizationId);
    const { data: otherRows, error: otherError } = await client
      .from("organization_memberships")
      .select("organization_id, application_user_id, role, status")
      .eq("organization_id", otherIdentity.organizationId);

    expect(ownError).toBeNull();
    expect(ownRows).toEqual([
      {
        organization_id: identity.organizationId,
        application_user_id: identity.applicationUserId,
        role: "client_member",
        status: "active",
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

describe("invitation membership lifecycle RLS", () => {
  const lifecycle = fixtureIdentities.lifecycle;

  async function signIn(email, password) {
    const client = createAuthenticatedClient();
    const { error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    expect(error).toBeNull();
    return client;
  }

  test.each(["pendingClient", "revokedClient"])(
    "%s cannot read its inactive organization or membership",
    async (key) => {
      const fixture = lifecycle[key];
      const client = await signIn(fixture.email, fixture.password);
      const { data: organizations, error: organizationError } = await client
        .from("organizations")
        .select("id")
        .eq("id", fixture.organizationId);
      const { data: memberships, error: membershipError } = await client
        .from("organization_memberships")
        .select("organization_id")
        .eq("organization_id", fixture.organizationId);

      expect(organizationError).toBeNull();
      expect(organizations).toEqual([]);
      expect(membershipError).toBeNull();
      expect(memberships).toEqual([]);
      await client.auth.signOut();
    },
  );

  test("staff authority can read invitation lifecycle records without client membership", async () => {
    const client = await signIn(
      lifecycle.staff.email,
      lifecycle.staff.password,
    );
    const { data, error } = await client
      .from("organization_invitations")
      .select("id, token_hash, consumed_at, revoked_at, replaced_at, replacement_invitation_id")
      .in("id", Object.values(lifecycle.invitationIds));

    expect(error).toBeNull();
    expect(data).toHaveLength(6);
    expect(data.every((invitation) => /^[a-f0-9]{64}$/.test(invitation.token_hash)))
      .toBe(true);
    expect(data.find((invitation) => invitation.id === lifecycle.invitationIds.consumed)
      ?.consumed_at).not.toBeNull();
    expect(data.find((invitation) => invitation.id === lifecycle.invitationIds.revoked)
      ?.revoked_at).not.toBeNull();
    const replaced = data.find(
      (invitation) => invitation.id === lifecycle.invitationIds.replaced,
    );
    expect(replaced?.replaced_at).not.toBeNull();
    expect(replaced?.replacement_invitation_id).toBe(
      lifecycle.invitationIds.replacement,
    );
    await client.auth.signOut();
  });

  test("an active client membership does not grant staff invitation access", async () => {
    const client = await signIn(tenantFixtures[0].email, tenantFixtures[0].password);
    const { data, error } = await client
      .from("organization_invitations")
      .select("id")
      .eq("id", lifecycle.invitationIds.current);

    expect(error).toBeNull();
    expect(data).toEqual([]);
    await client.auth.signOut();
  });
});

describe.each(tenantFixtures)(
  "$key machine PostgreSQL tenant isolation",
  (fixture) => {
    const otherFixture = tenantFixtures.find(
      (candidate) => candidate.key !== fixture.key,
    );
    const identity = fixtureIdentities[fixture.key];
    const otherIdentity = fixtureIdentities[otherFixture.key];
    let client;

    beforeAll(async () => {
      if (!identity?.machineIntegrationId || !otherIdentity) {
        throw new Error("Machine fixture identities are incomplete");
      }

      client = createMachineClient(
        await signMachineToken(identity.machineIntegrationId),
      );
    });

    test("reads only its currently granted engagement", async () => {
      const { data: ownRows, error: ownError } = await client
        .from("engagements")
        .select("id, organization_id, name, organizations(name)")
        .eq("id", identity.engagementId);
      const { data: otherRows, error: otherError } = await client
        .from("engagements")
        .select("id, organization_id, name, organizations(name)")
        .eq("id", otherIdentity.engagementId);

      expect(ownError).toBeNull();
      expect(ownRows).toEqual([
        {
          id: identity.engagementId,
          organization_id: identity.organizationId,
          name: fixture.engagementName,
          organizations: {
            name: fixture.organizationName,
          },
        },
      ]);
      expect(otherError).toBeNull();
      expect(otherRows).toEqual([]);
    });

    test("caller-manipulated organization scope cannot reveal another tenant", async () => {
      const { data, error } = await client
        .from("engagements")
        .select("id, organization_id")
        .eq("organization_id", otherIdentity.organizationId);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    test.each([
      ["capability", "machineWithoutCapabilityId"],
      ["organization grant", "machineWithoutOrganizationGrantId"],
      ["engagement grant", "machineWithoutEngagementGrantId"],
    ])("denies access without a current %s", async (_, integrationKey) => {
      const restrictedClient = createMachineClient(
        await signMachineToken(identity[integrationKey]),
      );
      const { data, error } = await restrictedClient
        .from("engagements")
        .select("id");

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    test.each(machineSecurityTables)(
      "cannot read protected machine table %s",
      async (table) => {
        const { data, error } = await client.from(table).select("*");

        expect(data).toBeNull();
        expect(error?.message).toMatch(/permission denied/i);
      },
    );

    test("cannot mutate an otherwise readable engagement", async () => {
      const { data, error } = await client
        .from("engagements")
        .update({ name: "Unauthorized mutation" })
        .eq("id", identity.engagementId)
        .select("id");

      expect(data).toBeNull();
      expect(error?.message).toMatch(/permission denied/i);
    });
  },
);

describe("machine claim rejection", () => {
  const identity = fixtureIdentities.tenantA;
  const otherIdentity = fixtureIdentities.tenantB;

  test.each([
    ["wrong issuer", { issuer: "untrusted-issuer" }],
    ["wrong audience", { audience: "untrusted-audience" }],
    ["wrong role", { role: "authenticated" }],
    ["expired", { expiresInSeconds: -1 }],
    ["missing integration", { includeIntegration: false }],
  ])("does not expose rows for %s claims", async (_, options) => {
    const client = createMachineClient(
      await signMachineToken(identity.machineIntegrationId, options),
    );
    const { data, error } = await client
      .from("engagements")
      .select("id");

    expect(data ?? []).toEqual([]);
    if (error) expect(error.message).not.toContain(otherIdentity.engagementId);
  });

  test("rejects a forged signing key", async () => {
    const attackerKeys = await generateKeyPair("ES256", {
      extractable: true,
    });
    const attackerJwk = {
      ...(await exportJWK(attackerKeys.privateKey)),
      alg: "ES256",
      kid: "attacker-key",
    };
    const client = createMachineClient(
      await signMachineToken(identity.machineIntegrationId, {
        privateJwk: attackerJwk,
      }),
    );
    const { data } = await client.from("engagements").select("id");

    expect(data ?? []).toEqual([]);
  });

  test("rejects a token signed with the wrong algorithm", async () => {
    const rsaKeys = await generateKeyPair("RS256", {
      extractable: true,
    });
    const rsaJwk = {
      ...(await exportJWK(rsaKeys.privateKey)),
      alg: "RS256",
      kid: "wrong-algorithm-key",
    };
    const client = createMachineClient(
      await signMachineToken(identity.machineIntegrationId, {
        privateJwk: rsaJwk,
        algorithm: "RS256",
      }),
    );
    const { data } = await client.from("engagements").select("id");

    expect(data ?? []).toEqual([]);
  });
});
