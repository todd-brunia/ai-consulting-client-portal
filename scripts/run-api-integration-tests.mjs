import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
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

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForApplication(url, child, output) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before startup:\n${output.join("")}`);
    }

    try {
      const response = await fetch(`${url}/api/v1/engagements`);
      if (response.status === 401) return;
    } catch {
      // The application is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Next.js did not become ready:\n${output.join("")}`);
}

async function stopApplication(child) {
  if (child.exitCode !== null) return;

  const signalProcessGroup = (signal) => {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  };

  signalProcessGroup("SIGTERM");
  const stopped = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);

  if (!stopped) signalProcessGroup("SIGKILL");
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

const port = await findAvailablePort();
const applicationUrl = `http://127.0.0.1:${port}`;
const applicationOutput = [];
const application = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--port", String(port)],
  {
    detached: true,
    env: {
      ...testEnvironment,
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

application.stdout.on("data", (chunk) => applicationOutput.push(chunk));
application.stderr.on("data", (chunk) => applicationOutput.push(chunk));

try {
  await waitForApplication(applicationUrl, application, applicationOutput);
  execFileSync(
    "npx",
    [
      "vitest",
      "run",
      "tests/integration/engagements-api.test.mjs",
      "--config",
      "vitest.integration.config.mts",
    ],
    {
      env: {
        ...testEnvironment,
        SUPABASE_TEST_URL: status.API_URL,
        SUPABASE_TEST_ANON_KEY: status.ANON_KEY,
        SUPABASE_TEST_FIXTURES: JSON.stringify(fixtureIdentities),
        PORTAL_TEST_URL: applicationUrl,
      },
      stdio: "inherit",
    },
  );
} finally {
  await stopApplication(application);
}
