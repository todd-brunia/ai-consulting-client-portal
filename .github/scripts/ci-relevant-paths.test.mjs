import { describe, expect, test } from "vitest";
import {
  readRelevantPatterns,
  requiresSupabaseIntegration,
} from "./ci-relevant-paths.mjs";

const patterns = readRelevantPatterns();

describe("Supabase-relevant path detection", () => {
  test.each([
    "supabase/migrations/20260723010000_example.sql",
    "supabase/migrations/20260724010000_add_agent_credentials.sql",
    "supabase/migrations/20260724020000_add_machine_engagement_rls.sql",
    "supabase/migrations/20260724030000_grant_machine_auth_adapter_access.sql",
    "bruno/bruno.json",
    "bruno/environments/Local.bru",
    "bruno/engagements/06 Authorized machine.bru",
    "src/lib/agents/authorization.ts",
    "src/lib/agents/authorization.test.ts",
    "src/lib/agents/credentials.ts",
    "src/lib/agents/credentials.test.ts",
    "src/lib/agents/engagement-api-auth.ts",
    "src/lib/agents/engagement-api-auth.test.ts",
    "src/lib/agents/machine-database.ts",
    "src/lib/agents/machine-database.test.ts",
    "src/lib/agents/supabase-repositories.ts",
    "src/lib/agents/types.ts",
    "src/lib/engagements/service.ts",
    "src/lib/engagements/service.test.ts",
    "src/lib/supabase/server.ts",
    "src/app/api/v1/engagements/route.ts",
    "src/app/login/actions.ts",
    "src/app/page.tsx",
    "src/lib/json-api.ts",
    "src/proxy.ts",
    "tests/integration/engagements-api.test.mjs",
    "tests/integration/rls-tenant-isolation.test.mjs",
    "tests/integration/supabase-fixtures.mjs",
    "scripts/run-api-integration-tests.mjs",
    "scripts/run-integration-suite.mjs",
    "scripts/run-rls-integration-tests.mjs",
    "scripts/setup-machine-signing-key.mjs",
    "scripts/bruno-local-fixtures.mjs",
    "scripts/run-bruno-tests.mjs",
    "scripts/setup-bruno-local.mjs",
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

  test("requires integration when revisions are unknown", () => {
    expect(
      requiresSupabaseIntegration([], patterns, { revisionsKnown: false }),
    ).toBe(true);
  });

  test("requires integration when revisions are unavailable", () => {
    expect(
      requiresSupabaseIntegration([], patterns, { revisionsAvailable: false }),
    ).toBe(true);
  });
});
