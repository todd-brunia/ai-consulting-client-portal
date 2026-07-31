import { describe, expect, test } from "vitest";

import { assertPlaywrightGateContract } from "./ci-gate-contract.mjs";

describe("Chromium Playwright CI Gate contract", () => {
  test.each([
    ["true", "success"],
    ["false", "skipped"],
  ])("accepts required=%s with result=%s", (required, result) => {
    expect(() => assertPlaywrightGateContract(required, result)).not.toThrow();
  });

  test.each([
    ["true", "skipped"],
    ["false", "success"],
    ["true", "failure"],
    ["true", "cancelled"],
    ["false", "failure"],
    ["false", "cancelled"],
    ["unknown", "skipped"],
  ])("rejects required=%s with result=%s", (required, result) => {
    expect(() => assertPlaywrightGateContract(required, result)).toThrow(
      `required=${required} result=${result}`,
    );
  });
});
