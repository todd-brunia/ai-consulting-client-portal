import { execFileSync } from "node:child_process";
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
const fixtures = await provisionIntegrationFixtures({
  apiUrl: status.API_URL,
  serviceRoleKey: status.SERVICE_ROLE_KEY,
});

const fixtureIdentities = Object.fromEntries(
  Object.entries(fixtures).map(([key, fixture]) => [
    key,
    {
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      engagementId: fixture.engagementId,
    },
  ]),
);

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
  ["vitest", "run", "--config", "vitest.integration.config.mts"],
  {
    env: {
      ...testEnvironment,
      SUPABASE_TEST_URL: status.API_URL,
      SUPABASE_TEST_ANON_KEY: status.ANON_KEY,
      SUPABASE_TEST_FIXTURES: JSON.stringify(fixtureIdentities),
    },
    stdio: "inherit",
  },
);
