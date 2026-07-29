import { describe, expect, test } from "vitest";
import {
  assertDisposableLocalTargets,
  createUnprivilegedEnvironment,
} from "./playwright-local-environment.mjs";

describe("Playwright local environment", () => {
  test("accepts explicit, separate loopback targets", () => {
    expect(() =>
      assertDisposableLocalTargets({
        apiUrl: "http://127.0.0.1:54321",
        applicationUrl: "http://localhost:3100",
      }),
    ).not.toThrow();
  });

  test.each([
    ["https://project.supabase.co", "http://127.0.0.1:3100"],
    ["http://192.168.1.10:54321", "http://127.0.0.1:3100"],
    ["http://127.0.0.1:54321", "https://localhost:3100"],
    ["http://127.0.0.1", "http://localhost:3100"],
    ["http://127.0.0.1:3100", "http://localhost:3100"],
  ])("refuses unsafe targets", (apiUrl, applicationUrl) => {
    expect(() =>
      assertDisposableLocalTargets({ apiUrl, applicationUrl }),
    ).toThrow();
  });

  test("removes privileged credentials from child environments", () => {
    const child = createUnprivilegedEnvironment(
      {
        PATH: "/local/bin",
        SUPABASE_SECRET_KEY: "secret",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        SERVICE_ROLE_KEY: "service",
        MACHINE_JWT_PRIVATE_JWK: "private",
      },
      { PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3100" },
    );

    expect(child).toEqual({
      PATH: "/local/bin",
      PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3100",
    });
  });
});
