import { fileURLToPath } from "node:url";

export function hasValidConditionalResult(required, result) {
  return (
    (required === "true" && result === "success") ||
    (required === "false" && result === "skipped")
  );
}

export function assertPlaywrightGateContract(required, result) {
  if (!hasValidConditionalResult(required, result)) {
    throw new Error(
      `Chromium Playwright contract: required=${required} result=${result}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    assertPlaywrightGateContract(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
