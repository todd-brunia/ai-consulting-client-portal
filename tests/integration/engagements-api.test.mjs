import { createServerClient } from "@supabase/ssr";
import { describe, expect, test } from "vitest";
import { tenantFixtures } from "./supabase-fixtures.mjs";

const mediaType = "application/vnd.api+json";
const apiUrl = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const portalUrl = process.env.PORTAL_TEST_URL;
const fixtureIdentities = JSON.parse(
  process.env.SUPABASE_TEST_FIXTURES ?? "{}",
);

if (!apiUrl || !anonKey || !portalUrl) {
  throw new Error(
    "Run these tests with `npm run test:integration:api` against local Supabase.",
  );
}

async function createAuthenticationCookies(fixture) {
  const cookies = new Map();
  const client = createServerClient(apiUrl, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (newCookies) => {
        for (const cookie of newCookies) cookies.set(cookie.name, cookie.value);
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: fixture.email,
    password: fixture.password,
  });

  expect(error).toBeNull();
  return [...cookies.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function expectAuthenticationError(response) {
  expect(response.status).toBe(401);
  expect(response.headers.get("content-type")).toBe(mediaType);
  await expect(response.json()).resolves.toEqual({
    errors: [
      {
        status: "401",
        code: "unauthorized",
        title: "Authentication required",
      },
    ],
  });
}

function machineRequest(apiKey, headers = {}) {
  return fetch(`${portalUrl}/api/v1/engagements`, {
    headers: {
      ...headers,
      authorization: `Bearer ${apiKey}`,
    },
  });
}

test("returns a JSON:API authentication error without a session", async () => {
  const response = await fetch(`${portalUrl}/api/v1/engagements`);

  await expectAuthenticationError(response);
});

test("does not expose service-role credentials to endpoint assertions", () => {
  expect(process.env.SERVICE_ROLE_KEY).toBeUndefined();
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  expect(process.env.SUPABASE_SECRET_KEY).toBeUndefined();
  expect(process.env.MACHINE_JWT_PRIVATE_JWK).toBeUndefined();
});

describe.each(tenantFixtures)("$key engagements endpoint", (fixture) => {
  test("returns only its JSON:API engagement resource", async () => {
    const identity = fixtureIdentities[fixture.key];
    const otherFixture = tenantFixtures.find(
      (candidate) => candidate.key !== fixture.key,
    );
    const otherIdentity = fixtureIdentities[otherFixture.key];
    const cookie = await createAuthenticationCookies(fixture);
    const response = await fetch(`${portalUrl}/api/v1/engagements`, {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(mediaType);

    const document = await response.json();
    expect(document.jsonapi).toEqual({ version: "1.1" });
    expect(document.data).toHaveLength(1);
    expect(document.data[0]).toEqual({
      type: "engagements",
      id: identity.engagementId,
      attributes: {
        name: fixture.engagementName,
        status: "exploring",
        "created-at": expect.any(String),
      },
      relationships: {
        organization: {
          data: {
            type: "organizations",
            id: identity.organizationId,
          },
        },
      },
    });
    expect(document.data.map((resource) => resource.id)).not.toContain(
      otherIdentity.engagementId,
    );
  });

  test("returns only its machine-granted JSON:API engagement resource", async () => {
    const identity = fixtureIdentities[fixture.key];
    const otherFixture = tenantFixtures.find(
      (candidate) => candidate.key !== fixture.key,
    );
    const otherIdentity = fixtureIdentities[otherFixture.key];
    const response = await machineRequest(identity.machineApiKey);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(mediaType);
    const document = await response.json();
    expect(document.jsonapi).toEqual({ version: "1.1" });
    expect(document.data).toEqual([
      {
        type: "engagements",
        id: identity.engagementId,
        attributes: {
          name: fixture.engagementName,
          status: "exploring",
          "created-at": expect.any(String),
        },
        relationships: {
          organization: {
            data: {
              type: "organizations",
              id: identity.organizationId,
            },
          },
        },
      },
    ]);
    expect(document.data.map(({ id }) => id)).not.toContain(
      otherIdentity.engagementId,
    );
  });

  test.each([
    ["organization", "machineWithoutOrganizationGrantApiKey"],
    ["engagement", "machineWithoutEngagementGrantApiKey"],
  ])("returns an empty collection without a current %s grant", async (_, key) => {
    const identity = fixtureIdentities[fixture.key];
    const response = await machineRequest(identity[key]);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(mediaType);
    await expect(response.json()).resolves.toEqual({
      jsonapi: { version: "1.1" },
      data: [],
    });
  });

  test("returns a generic forbidden error without the read capability", async () => {
    const identity = fixtureIdentities[fixture.key];
    const response = await machineRequest(
      identity.machineWithoutCapabilityApiKey,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toBe(mediaType);
    await expect(response.json()).resolves.toEqual({
      errors: [
        {
          status: "403",
          code: "forbidden",
          title: "Access denied",
        },
      ],
    });
  });

  test("rejects a competing valid human session and bearer credential", async () => {
    const identity = fixtureIdentities[fixture.key];
    const cookie = await createAuthenticationCookies(fixture);
    const response = await machineRequest(identity.machineApiKey, {
      cookie,
    });

    await expectAuthenticationError(response);
  });
});

describe("invalid machine authentication", () => {
  const identity = fixtureIdentities.tenantA;

  test.each([
    ["malformed", "not-a-portal-key"],
    [
      "unknown",
      `portal_agent_8899aabbccddeeff_${"B".repeat(43)}`,
    ],
    ["expired", identity.expiredMachineApiKey],
    ["revoked", identity.revokedMachineApiKey],
  ])("returns the same generic error for a %s credential", async (_, apiKey) => {
    const response = await machineRequest(apiKey);

    await expectAuthenticationError(response);
  });
});

describe("staff invitation lifecycle API", () => {
  const staff = {
    email: "staff-admin@portal.test",
    password: "local-integration-only-password",
  };

  test("requires authentication without disclosing invitation state", async () => {
    const response = await fetch(`${portalUrl}/api/v1/invitations`);
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("invitationId");
  });

  test("issues, inspects, conflicts, replaces, and revokes without returning token material", async () => {
    const cookie = await createAuthenticationCookies(staff);
    const organizationId = fixtureIdentities.tenantA.organizationId;
    const body = {
      organizationId,
      email: "api-invited-client@portal.test",
    };
    const issue = () =>
      fetch(`${portalUrl}/api/v1/invitations`, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

    const createdResponse = await issue();
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    const serialized = JSON.stringify(created);
    expect(created.data.attributes.email).toBe(body.email);
    expect(created.data.attributes.status).toBe("pending");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("hash");

    const duplicate = await issue();
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).errors[0].code).toBe(
      "invitation_lifecycle_conflict",
    );

    const inspected = await fetch(
      `${portalUrl}/api/v1/invitations/${created.data.id}`,
      { headers: { cookie } },
    );
    expect(inspected.status).toBe(200);
    expect((await inspected.json()).data.id).toBe(created.data.id);

    const listed = await fetch(
      `${portalUrl}/api/v1/invitations?organizationId=${organizationId}`,
      { headers: { cookie } },
    );
    expect(listed.status).toBe(200);
    expect((await listed.json()).data.map(({ id }) => id)).toContain(
      created.data.id,
    );

    const replacement = await fetch(
      `${portalUrl}/api/v1/invitations/${created.data.id}/replace`,
      { method: "POST", headers: { cookie } },
    );
    expect(replacement.status).toBe(201);
    const replacementDocument = await replacement.json();
    expect(replacementDocument.data.id).not.toBe(created.data.id);

    const staleReplacement = await fetch(
      `${portalUrl}/api/v1/invitations/${created.data.id}/replace`,
      { method: "POST", headers: { cookie } },
    );
    expect(staleReplacement.status).toBe(409);

    const revokeUrl =
      `${portalUrl}/api/v1/invitations/${replacementDocument.data.id}/revoke`;
    const revoked = await fetch(revokeUrl, {
      method: "POST",
      headers: { cookie },
    });
    const repeated = await fetch(revokeUrl, {
      method: "POST",
      headers: { cookie },
    });
    expect(revoked.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).data.attributes.status).toBe("revoked");
  });

  test("does not infer staff authority from active client membership", async () => {
    const cookie = await createAuthenticationCookies(tenantFixtures[0]);
    const response = await fetch(
      `${portalUrl}/api/v1/invitations?organizationId=${fixtureIdentities.tenantA.organizationId}`,
      { headers: { cookie } },
    );
    expect(response.status).toBe(403);
  });
});
