import { describe, expect, test } from "vitest";

import {
  detectPlaywrightRequirement,
  readPlaywrightPatterns,
  requiresPlaywright,
} from "./playwright-relevant-paths.mjs";

const patterns = readPlaywrightPatterns();

describe("Playwright-relevant path detection", () => {
  test.each([
    "src/app/page.tsx",
    "src/lib/supabase/server.ts",
    "supabase/migrations/20260731010000_example.sql",
    "tests/e2e/auth-workspace.spec.ts",
    "scripts/run-playwright-local.mjs",
    "scripts/playwright-local-environment.mjs",
    "playwright.config.ts",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    "vitest.config.mts",
    "vitest.integration.config.mts",
    ".env.local.example",
    ".github/workflows/ci.yml",
    ".github/ci-playwright-paths.txt",
    ".github/scripts/ci-relevant-paths.mjs",
    ".github/scripts/playwright-relevant-paths.mjs",
  ])("requires Playwright for %s", (path) => {
    expect(requiresPlaywright([path], patterns)).toBe(true);
  });

  test.each([
    "README.md",
    "docs/github-change-workflow.md",
    ".github/workflows/codex-label-automation.yml",
    ".github/ISSUE_TEMPLATE/devops.yml",
  ])("skips Playwright for %s", (path) => {
    expect(requiresPlaywright([path], patterns)).toBe(false);
  });

  test("requires Playwright when any changed path is relevant", () => {
    expect(requiresPlaywright(["README.md", "src/app/page.tsx"], patterns)).toBe(
      true,
    );
  });

  test("evaluates both old and new rename paths", () => {
    expect(
      requiresPlaywright(["src/app/old-page.tsx", "docs/renamed.md"], patterns),
    ).toBe(true);
  });

  test("skips an empty known change set", () => {
    expect(requiresPlaywright([], patterns)).toBe(false);
  });

  test.each([
    { revisionsKnown: false },
    { revisionsAvailable: false },
  ])("fails open for unavailable comparison revisions", (options) => {
    expect(requiresPlaywright([], patterns, options)).toBe(true);
  });

  test("fails open for an all-zero comparison revision", () => {
    expect(
      detectPlaywrightRequirement({
        baseSha: "0000000000000000000000000000000000000000",
        headSha: "HEAD",
      }),
    ).toBe(true);
  });

  test("allows a manual full-suite run to bypass path filtering", () => {
    expect(detectPlaywrightRequirement({ force: true })).toBe(true);
  });
});
