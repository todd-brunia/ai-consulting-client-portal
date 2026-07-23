import { spawnSync } from "node:child_process";

function runStage(name, command, arguments_, { quiet = false } = {}) {
  console.log(`Integration stage: ${name}`);
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "inherit"] : "inherit",
  });

  if (result.error) {
    throw new Error(`${name} could not start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${name} failed with status ${result.status}`);
  }

}

let failed = false;

try {
  runStage("lint the migrated schema", "npm", ["run", "supabase:lint"]);
  runStage("provision deterministic fixtures", "npm", [
    "run",
    "supabase:test:fixtures",
  ]);
  runStage("test authenticated RLS", "npm", [
    "run",
    "test:integration:rls",
  ]);
  runStage("test the authenticated JSON:API endpoint", "npm", [
    "run",
    "test:integration:api",
  ]);
} catch (error) {
  failed = true;
  console.error(`Integration suite failed: ${error.message}`);
}

if (failed) process.exit(1);
console.log("Integration suite completed successfully.");
