import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { provisionIntegrationFixtures } from "../tests/integration/supabase-fixtures.mjs";
import {
  assertDisposableLocalTargets,
  createUnprivilegedEnvironment,
  readDisposableSupabaseStatus,
} from "./playwright-local-environment.mjs";

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function waitForApplication(url, child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before startup:\n${output.join("")}`);
    }
    try {
      const response = await fetch(`${url}/login`);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js did not become ready:\n${output.join("")}`);
}

async function stopApplication(child) {
  if (child.exitCode !== null) return;
  const signal = (name) =>
    process.platform === "win32"
      ? child.kill(name)
      : process.kill(-child.pid, name);
  signal("SIGTERM");
  const stopped = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!stopped) signal("SIGKILL");
}

const status = readDisposableSupabaseStatus();
const machinePrivateJwk = JSON.parse(
  readFileSync("supabase/signing_keys.json", "utf8"),
).find((key) => key.alg === "ES256" && key.d);
if (!machinePrivateJwk) {
  throw new Error(
    "The local machine signing-key file has no private ES256 key. Run `npm run supabase:start`.",
  );
}

await provisionIntegrationFixtures({
  apiUrl: status.API_URL,
  serviceRoleKey: status.SERVICE_ROLE_KEY,
});

const port = await findAvailablePort();
const applicationUrl = `http://127.0.0.1:${port}`;
assertDisposableLocalTargets({
  apiUrl: status.API_URL,
  applicationUrl,
});

const applicationEnvironment = {
  ...createUnprivilegedEnvironment(process.env),
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
  MACHINE_JWT_PRIVATE_JWK: JSON.stringify(machinePrivateJwk),
};

console.log("Building the production application for local Playwright tests.");
execFileSync("npm", ["run", "build"], {
  env: applicationEnvironment,
  stdio: "inherit",
});

const output = [];
const application = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--port", String(port)],
  {
    detached: true,
    env: applicationEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
application.stdout.on("data", (chunk) => output.push(chunk));
application.stderr.on("data", (chunk) => output.push(chunk));

try {
  await waitForApplication(applicationUrl, application, output);
  console.log("Running serial Chromium checks against the production server.");
  execFileSync(
    "npx",
    ["playwright", "test", ...process.argv.slice(2)],
    {
      env: createUnprivilegedEnvironment(process.env, {
        PLAYWRIGHT_BASE_URL: applicationUrl,
      }),
      stdio: "inherit",
    },
  );
} finally {
  await stopApplication(application);
}
