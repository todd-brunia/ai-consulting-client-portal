import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readRelevantPatterns,
  requiresRelevantCheck,
} from "./ci-relevant-paths.mjs";

export const alwaysPlaywrightRelevantPaths = new Set([
  ".github/workflows/ci.yml",
  ".github/ci-playwright-paths.txt",
  ".github/scripts/ci-relevant-paths.mjs",
  ".github/scripts/ci-gate-contract.mjs",
  ".github/scripts/ci-gate-contract.test.mjs",
  ".github/scripts/playwright-relevant-paths.mjs",
  ".github/scripts/playwright-relevant-paths.test.mjs",
  ".github/scripts/playwright-ci-workflow.test.mjs",
]);

export function readPlaywrightPatterns() {
  return readRelevantPatterns(
    resolve(process.cwd(), ".github/ci-playwright-paths.txt"),
  );
}

export function requiresPlaywright(
  changedPaths,
  patterns = readPlaywrightPatterns(),
  options = {},
) {
  return requiresRelevantCheck(changedPaths, patterns, {
    ...options,
    alwaysRelevantPaths: alwaysPlaywrightRelevantPaths,
  });
}

function revisionExists(revision) {
  if (!revision || /^0+$/u.test(revision)) {
    return false;
  }

  try {
    execFileSync("git", ["cat-file", "-e", `${revision}^{commit}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function changedPathsBetween(baseSha, headSha) {
  if (!revisionExists(baseSha) || !revisionExists(headSha)) {
    return { revisionsKnown: false, revisionsAvailable: false, paths: [] };
  }

  try {
    const output = execFileSync(
      "git",
      ["diff", "--no-renames", "--name-only", "-z", baseSha, headSha],
      { encoding: "utf8" },
    );
    return {
      revisionsKnown: true,
      revisionsAvailable: true,
      paths: output.split("\0").filter(Boolean),
    };
  } catch {
    return { revisionsKnown: true, revisionsAvailable: false, paths: [] };
  }
}

export function detectPlaywrightRequirement({
  baseSha,
  headSha,
  force = false,
} = {}) {
  if (force) {
    return true;
  }

  const { paths, revisionsKnown, revisionsAvailable } = changedPathsBetween(
    baseSha,
    headSha,
  );
  return requiresPlaywright(paths, readPlaywrightPatterns(), {
    revisionsKnown,
    revisionsAvailable,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(
    String(
      detectPlaywrightRequirement({
        baseSha: process.env.BASE_SHA,
        headSha: process.env.HEAD_SHA,
        force: process.env.FORCE_PLAYWRIGHT === "true",
      }),
    ),
  );
}
