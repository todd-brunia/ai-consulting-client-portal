import { describe, expect, test, vi } from "vitest";
import { createCleanupStack } from "./playwright-database-cleanup.mjs";

describe("Playwright database cleanup", () => {
  test("runs in reverse order and continues after a cleanup failure", async () => {
    const order = [];
    const cleanup = createCleanupStack();
    cleanup.register(vi.fn(async () => order.push("first")));
    cleanup.register(
      vi.fn(async () => {
        order.push("second");
        throw new Error("expected cleanup failure");
      }),
    );
    cleanup.register(vi.fn(async () => order.push("third")));

    await expect(cleanup.run()).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: "expected cleanup failure" })],
    });
    expect(order).toEqual(["third", "second", "first"]);

    await expect(cleanup.run()).resolves.toBeUndefined();
  });
});
