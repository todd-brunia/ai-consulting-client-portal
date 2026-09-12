import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(".github/workflows/implementation.yml"), "utf8");

describe("supervised implementation workflow", () => {
  it("exposes only the exact dispatch correlation as the canonical run title", () => {
    expect(workflow.match(/^run-name:.*$/gm)).toEqual(["run-name: ${{ inputs.correlation }}"]);
    expect(workflow).toMatch(/^name: Supervised implementation evidence$/m);
  });

  it("has only the #72 bounded dispatch inputs and read-only evidence behavior", () => {
    for (const input of ["issue_number", "run_id", "work_item_id", "plan_sha256", "binding_sha256", "correlation"]) expect(workflow).toContain(`      ${input}:`);
    expect([...workflow.matchAll(/^      ([a-z_0-9]+):$/gm)].map((match) => match[1])).toEqual([
      "issue_number", "run_id", "work_item_id", "plan_sha256", "binding_sha256", "correlation",
    ]);
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("    permissions:\n      contents: read");
    expect(workflow).toContain('[[ "$CORRELATION" == "orchestrator:$RUN_ID:$WORK_ITEM_ID:$BINDING_SHA256" ]]');
    expect(workflow).toContain("Supervised implementation dispatch contract validated.");
    expect(workflow).not.toMatch(/actions\/checkout|contents:\s*write|pull-requests:|deploy|release|merge|gh api/);
  });
});
