import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const playwrightJob = workflow.slice(
  workflow.indexOf("  playwright:"),
  workflow.indexOf("  ci-gate:"),
);
const gateJob = workflow.slice(workflow.indexOf("  ci-gate:"));

describe("Playwright CI workflow", () => {
  test("runs the production-built suite for every workflow invocation", () => {
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("branches: [main]");
    expect(playwrightJob).toContain("name: Chromium Playwright");
    expect(playwrightJob).toContain("npm run test:e2e");
    expect(playwrightJob).not.toContain("if: needs.");
  });

  test("owns an isolated Supabase lifecycle with unconditional cleanup", () => {
    expect(playwrightJob).toContain("npm run supabase:start > /dev/null");
    expect(playwrightJob).toContain("npm run supabase:reset");
    expect(playwrightJob).toMatch(
      /name: Stop and remove Supabase stack\s+if: always\(\)/,
    );
    expect(playwrightJob).toContain(
      "npm run supabase:stop -- --no-backup > /dev/null",
    );
  });

  test("scans and retains failure diagnostics without video", () => {
    expect(playwrightJob).toContain(
      "node .github/scripts/playwright-artifact-safety.mjs playwright-report test-results",
    );
    expect(playwrightJob).toContain("steps.artifact_safety.outcome == 'success'");
    expect(playwrightJob).toContain("retention-days: 7");
    expect(readFileSync("playwright.config.ts", "utf8")).toContain(
      'video: "off"',
    );
  });

  test("makes Chromium Playwright part of the stable CI Gate contract", () => {
    expect(gateJob).toContain("- playwright");
    expect(gateJob).toContain(
      "PLAYWRIGHT_RESULT: ${{ needs.playwright.result }}",
    );
    expect(gateJob).toContain(
      'if [[ "$PLAYWRIGHT_RESULT" != success ]]',
    );
  });
});
