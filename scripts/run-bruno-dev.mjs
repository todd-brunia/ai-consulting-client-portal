import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readLocalSupabaseStatus } from "./bruno-local-fixtures.mjs";

const status = readLocalSupabaseStatus();
const signingKeys = JSON.parse(
  readFileSync("supabase/signing_keys.json", "utf8"),
);
const machinePrivateJwk = signingKeys.find(
  (key) => key.alg === "ES256" && key.d,
);

if (!machinePrivateJwk) {
  throw new Error(
    "The local machine signing-key file has no private ES256 key. Run `npm run supabase:start`.",
  );
}

console.log(
  "Starting Next.js with local machine credentials injected without printing or persisting them.",
);
const result = spawnSync(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
  ],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        status.PUBLISHABLE_KEY ?? status.ANON_KEY,
      SUPABASE_SECRET_KEY:
        status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
      MACHINE_JWT_PRIVATE_JWK: JSON.stringify(machinePrivateJwk),
    },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
