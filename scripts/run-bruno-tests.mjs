import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  brunoApplicationUrl,
  createBrunoChildEnvironment,
  provisionBrunoFixtures,
} from "./bruno-local-fixtures.mjs";

try {
  const response = await fetch(
    `${brunoApplicationUrl}/api/v1/engagements`,
  );
  if (response.status !== 401) {
    throw new Error(`received HTTP ${response.status}`);
  }
} catch (error) {
  const reason =
    error instanceof Error ? error.message : "unknown connection error";
  throw new Error(
    `The local portal is not ready at ${brunoApplicationUrl}. Run \`npm run dev\` first (${reason}).`,
  );
}

const secretEnvironment = await provisionBrunoFixtures();
const childEnvironment = createBrunoChildEnvironment(
  process.env,
  secretEnvironment,
);

console.log(
  "Running the Bruno collection against the local Next.js API without printing credentials.",
);
execFileSync(
  "npx",
  [
    "bru",
    "run",
    "engagements",
    "-r",
    "--env",
    "Local",
    "--bail",
    "--reporter-skip-all-headers",
  ],
  {
    cwd: resolve("bruno"),
    env: childEnvironment,
    stdio: "inherit",
  },
);
