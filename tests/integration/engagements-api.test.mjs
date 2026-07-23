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

test("returns a JSON:API authentication error without a session", async () => {
  const response = await fetch(`${portalUrl}/api/v1/engagements`);

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
});

test("does not expose service-role credentials to endpoint assertions", () => {
  expect(process.env.SERVICE_ROLE_KEY).toBeUndefined();
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  expect(process.env.SUPABASE_SECRET_KEY).toBeUndefined();
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
});
