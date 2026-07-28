import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { provisionIntegrationFixtures } from "../tests/integration/supabase-fixtures.mjs";

function readLocalSupabaseStatus() {
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

const status = readLocalSupabaseStatus();
let machineSigningKeys;
try {
  machineSigningKeys = JSON.parse(
    readFileSync("supabase/signing_keys.json", "utf8"),
  );
} catch {
  throw new Error(
    "Start Supabase with `npm run supabase:start` to generate and load the untracked local machine signing key.",
  );
}
const machinePrivateJwk = machineSigningKeys.find?.(
  (key) => key.alg === "ES256" && key.d,
);
if (!machinePrivateJwk) {
  throw new Error(
    "supabase/signing_keys.json does not contain a private ES256 key",
  );
}
const fixtures = await provisionIntegrationFixtures({
  apiUrl: status.API_URL,
  serviceRoleKey: status.SERVICE_ROLE_KEY,
});

const fixtureIdentities = Object.fromEntries(
  Object.entries(fixtures).map(([key, fixture]) => [
    key,
    {
      userId: fixture.userId,
      applicationUserId: fixture.applicationUserId,
      organizationId: fixture.organizationId,
      engagementId: fixture.engagementId,
      machineIntegrationId: fixture.machineIntegrationId,
      machineWithoutCapabilityId:
        fixture.machineWithoutCapabilityId,
      machineWithoutOrganizationGrantId:
        fixture.machineWithoutOrganizationGrantId,
      machineWithoutEngagementGrantId:
        fixture.machineWithoutEngagementGrantId,
    },
  ]),
);
fixtureIdentities.lifecycle = fixtures.lifecycle;

const testEnvironment = { ...process.env };
for (const secretName of [
  "SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
]) {
  delete testEnvironment[secretName];
}

execFileSync(
  "npx",
  [
    "vitest",
    "run",
    "tests/integration/rls-tenant-isolation.test.mjs",
    "--config",
    "vitest.integration.config.mts",
  ],
  {
    env: {
      ...testEnvironment,
      SUPABASE_TEST_URL: status.API_URL,
      SUPABASE_TEST_ANON_KEY: status.ANON_KEY,
      SUPABASE_TEST_FIXTURES: JSON.stringify(fixtureIdentities),
      SUPABASE_TEST_MACHINE_PRIVATE_JWK:
        JSON.stringify(machinePrivateJwk),
    },
    stdio: "inherit",
  },
);
