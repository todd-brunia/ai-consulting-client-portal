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

const summary = Object.values(fixtures).map((fixture) => ({
  tenant: fixture.key,
  email: fixture.email,
  organization: fixture.organizationName,
  engagement: fixture.engagementName,
}));

console.log("Created deterministic local Supabase integration fixtures:");
console.table(summary);
