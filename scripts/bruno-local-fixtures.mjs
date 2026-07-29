import { execFileSync } from "node:child_process";
import { createServerClient } from "@supabase/ssr";
import { provisionIntegrationFixtures } from "../tests/integration/supabase-fixtures.mjs";

const protectedEnvironmentNames = [
  "SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "MACHINE_JWT_PRIVATE_JWK",
];

export const brunoApplicationUrl = "http://127.0.0.1:3000";

export function readLocalSupabaseStatus() {
  let output;

  try {
    output = execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch {
    throw new Error(
      "Could not read local Supabase status. Start the stack with `npm run supabase:start`.",
    );
  }

  try {
    return JSON.parse(output);
  } catch {
    throw new Error("Supabase status did not return valid JSON");
  }
}

export function createBrunoSecretEnvironment(
  fixtures,
  staffCookie,
) {
  const tenant = fixtures.tenantA;
  if (!tenant) {
    throw new Error("The tenant A Bruno fixture was not provisioned");
  }

  const environment = {
    PORTAL_API_KEY: tenant.machineApiKey,
    PORTAL_MALFORMED_API_KEY: "not-a-portal-key",
    PORTAL_UNKNOWN_API_KEY:
      `portal_agent_8899aabbccddeeff_${"B".repeat(43)}`,
    PORTAL_NO_CAPABILITY_API_KEY:
      tenant.machineWithoutCapabilityApiKey,
    PORTAL_NO_GRANT_API_KEY:
      tenant.machineWithoutOrganizationGrantApiKey,
    PORTAL_STAFF_ORGANIZATION_ID: tenant.organizationId,
  };
  if (staffCookie) environment.PORTAL_STAFF_COOKIE = staffCookie;
  return environment;
}

export function createBrunoChildEnvironment(
  processEnvironment,
  secretEnvironment,
) {
  const childEnvironment = {
    ...processEnvironment,
    ...secretEnvironment,
  };

  for (const name of protectedEnvironmentNames) {
    delete childEnvironment[name];
  }

  return childEnvironment;
}

export async function provisionBrunoFixtures() {
  const status = readLocalSupabaseStatus();
  const fixtures = await provisionIntegrationFixtures({
    apiUrl: status.API_URL,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  });

  const cookies = new Map();
  const staffClient = createServerClient(
    status.API_URL,
    status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    {
      cookies: {
        getAll: () => [],
        setAll: (newCookies) => {
          for (const cookie of newCookies) {
            cookies.set(cookie.name, cookie.value);
          }
        },
      },
    },
  );
  const { error } = await staffClient.auth.signInWithPassword({
    email: "staff-admin@portal.test",
    password: "local-integration-only-password",
  });
  if (error) {
    throw new Error("Could not create the local Bruno staff session");
  }
  const staffCookie = [...cookies.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  return createBrunoSecretEnvironment(fixtures, staffCookie);
}

export function serializeBrunoDotEnv(secretEnvironment) {
  return `${Object.entries(secretEnvironment)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n")}\n`;
}
