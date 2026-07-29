import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const forbiddenNames = [
  /^\.env(?:\.|$)/,
  /^signing_keys\.json$/,
  /\.pem$/,
];

const forbiddenContent = [
  "SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "MACHINE_JWT_PRIVATE_JWK",
  "sb_secret_",
  '"role":"service_role"',
];

export function inspectArtifactPaths(paths) {
  const violations = [];

  function inspect(path) {
    const name = basename(path);
    if (forbiddenNames.some((pattern) => pattern.test(name))) {
      violations.push(`${path}: forbidden credential-bearing filename`);
      return;
    }

    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) inspect(join(path, entry));
      return;
    }

    const contents = readFileSync(path);
    for (const marker of forbiddenContent) {
      if (contents.includes(Buffer.from(marker))) {
        violations.push(`${path}: contains forbidden server credential marker`);
        break;
      }
    }
  }

  for (const path of paths) {
    if (existsSync(path)) inspect(path);
  }

  return violations;
}

const isCli = process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  const violations = inspectArtifactPaths(process.argv.slice(2));
  if (violations.length > 0) {
    console.error("Playwright artifacts failed the server-credential safety check.");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log("Playwright artifacts contain no forbidden server credentials.");
  }
}
