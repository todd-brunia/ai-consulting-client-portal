import { execFileSync } from "node:child_process";

const protectedEnvironmentNames = [
  "SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "MACHINE_JWT_PRIVATE_JWK",
];

function requireLoopbackUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }

  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
  ) {
    throw new Error(`${label} must use HTTP on a loopback host`);
  }

  return url;
}

export function assertDisposableLocalTargets({ apiUrl, applicationUrl }) {
  const api = requireLoopbackUrl(apiUrl, "Supabase API URL");
  const application = requireLoopbackUrl(applicationUrl, "Application URL");

  if (!api.port || !application.port) {
    throw new Error("Local test targets must use explicit ports");
  }
  if (api.port === application.port) {
    throw new Error("Supabase and the application must use different origins");
  }
}

export function createUnprivilegedEnvironment(environment, additions = {}) {
  const childEnvironment = { ...environment, ...additions };
  for (const name of protectedEnvironmentNames) delete childEnvironment[name];
  return childEnvironment;
}

export function readDisposableSupabaseStatus() {
  let output;
  try {
    output = execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch {
    throw new Error(
      "Could not read local Supabase status. Start the disposable stack with `npm run supabase:start`.",
    );
  }

  let status;
  try {
    status = JSON.parse(output);
  } catch {
    throw new Error("Supabase status did not return valid JSON");
  }

  assertDisposableLocalTargets({
    apiUrl: status.API_URL,
    applicationUrl: "http://127.0.0.1:3000",
  });
  if (!status.SERVICE_ROLE_KEY || !(status.PUBLISHABLE_KEY ?? status.ANON_KEY)) {
    throw new Error("Local Supabase status is missing required credentials");
  }
  return status;
}
