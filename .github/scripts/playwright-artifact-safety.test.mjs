import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { inspectArtifactPaths } from "./playwright-artifact-safety.mjs";

const temporaryDirectories = [];

function createArtifactDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "playwright-artifacts-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Playwright artifact safety", () => {
  test("accepts ordinary reports, screenshots, and traces", () => {
    const directory = createArtifactDirectory();
    mkdirSync(join(directory, "data"));
    writeFileSync(join(directory, "index.html"), "<h1>Failed test</h1>");
    writeFileSync(join(directory, "data", "trace.zip"), "safe trace bytes");
    writeFileSync(join(directory, "failure.png"), "safe screenshot bytes");

    expect(inspectArtifactPaths([directory])).toEqual([]);
  });

  test.each([
    ".env",
    ".env.local",
    "signing_keys.json",
    "server.pem",
  ])("rejects credential-bearing filename %s", (filename) => {
    const directory = createArtifactDirectory();
    writeFileSync(join(directory, filename), "value");

    expect(inspectArtifactPaths([directory])).toEqual([
      expect.stringContaining("forbidden credential-bearing filename"),
    ]);
  });

  test.each([
    "SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "MACHINE_JWT_PRIVATE_JWK",
    "sb_secret_example",
    '{"role":"service_role"}',
  ])("rejects server credential marker %s", (marker) => {
    const directory = createArtifactDirectory();
    writeFileSync(join(directory, "trace.zip"), `binary:${marker}:bytes`);

    expect(inspectArtifactPaths([directory])).toEqual([
      expect.stringContaining("contains forbidden server credential marker"),
    ]);
  });

  test("ignores artifact directories that were not produced", () => {
    expect(inspectArtifactPaths(["missing-playwright-report"])).toEqual([]);
  });
});
