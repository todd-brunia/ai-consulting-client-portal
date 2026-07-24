import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const signingKeysPath = "supabase/signing_keys.json";

function containsPrivateEs256Key() {
  if (!existsSync(signingKeysPath)) return false;

  try {
    const keys = JSON.parse(readFileSync(signingKeysPath, "utf8"));
    return (
      Array.isArray(keys) &&
      keys.some(
        (key) =>
          key.kty === "EC" &&
          key.crv === "P-256" &&
          key.alg === "ES256" &&
          typeof key.kid === "string" &&
          typeof key.d === "string",
      )
    );
  } catch {
    throw new Error(
      `${signingKeysPath} exists but is not a valid signing-key array`,
    );
  }
}

if (!containsPrivateEs256Key()) {
  if (!existsSync(signingKeysPath)) {
    writeFileSync(signingKeysPath, "[]\n", {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  }

  execFileSync(
    "npx",
    [
      "supabase",
      "gen",
      "signing-key",
      "--append",
      "--algorithm",
      "ES256",
    ],
    { stdio: "inherit" },
  );
  chmodSync(signingKeysPath, 0o600);
  console.log("Generated an ignored local ES256 machine signing key.");
} else {
  console.log("Using the existing ignored local machine signing key.");
}
