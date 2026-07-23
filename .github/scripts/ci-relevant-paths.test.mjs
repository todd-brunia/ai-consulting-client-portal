import { describe, expect, test } from "vitest";
import {
  readRelevantPatterns,
  requiresSupabaseIntegration,
} from "./ci-relevant-paths.mjs";

const patterns = readRelevantPatterns();

describe("Supabase-relevant path detection", () => {
  test.each([
    "supabase/migrations/20260723010000_example.sql",
    "src/lib/supabase/server.ts",
    "src/app/api/v1/engagements/route.ts",
    "src/app/login/actions.ts",
    "src/app/page.tsx",
    "src/lib/json-api.ts",
    "src/proxy.ts",
    "tests/integration/engagements-api.test.mjs",
    "scripts/run-integration-suite.mjs",
    "scripts/setup-supabase-integration-fixtures.mjs",
    "package-lock.json",
    "vitest.integration.config.mts",
    "next.config.ts",
    "tsconfig.json",
    ".env.local.example",
    ".github/workflows/ci.yml",
    ".github/ci-supabase-paths.txt",
  ])("requires integration for %s", (path) => {
    expect(requiresSupabaseIntegration([path], patterns)).toBe(true);
  });

  test.each([
    "README.md",
    "docs/github-change-workflow.md",
    "public/window.svg",
    "src/app/globals.css",
    "src/app/favicon.ico",
  ])("skips integration for %s", (path) => {
    expect(requiresSupabaseIntegration([path], patterns)).toBe(false);
  });

  test("requires integration when any file in a multi-file change is relevant", () => {
    expect(
      requiresSupabaseIntegration(
        ["README.md", "src/app/api/v1/engagements/route.ts"],
        patterns,
      ),
    ).toBe(true);
  });

  test("treats old and new rename paths as ordinary changed paths", () => {
    expect(
      requiresSupabaseIntegration(
        ["src/app/api/old/route.ts", "docs/renamed.md"],
        patterns,
      ),
    ).toBe(true);
  });

  test("skips an empty change set", () => {
    expect(requiresSupabaseIntegration([], patterns)).toBe(false);
  });
});
