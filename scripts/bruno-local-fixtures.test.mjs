import { describe, expect, test } from "vitest";
import {
  createBrunoChildEnvironment,
  createBrunoSecretEnvironment,
  serializeBrunoDotEnv,
} from "./bruno-local-fixtures.mjs";

const secretValues = {
  machineApiKey: "allowed-key",
  machineWithoutCapabilityApiKey: "denied-key",
  machineWithoutOrganizationGrantApiKey: "no-grant-key",
};

describe("Bruno local fixture environment", () => {
  test("exposes only the supported machine-request credential cases", () => {
    expect(
      createBrunoSecretEnvironment({ tenantA: secretValues }),
    ).toEqual({
      PORTAL_API_KEY: "allowed-key",
      PORTAL_MALFORMED_API_KEY: "not-a-portal-key",
      PORTAL_UNKNOWN_API_KEY:
        `portal_agent_8899aabbccddeeff_${"B".repeat(43)}`,
      PORTAL_NO_CAPABILITY_API_KEY: "denied-key",
      PORTAL_NO_GRANT_API_KEY: "no-grant-key",
    });
  });

  test("does not pass provider or signing credentials to Bruno", () => {
    const environment = createBrunoChildEnvironment(
      {
        PATH: "/local/bin",
        SERVICE_ROLE_KEY: "service-role",
        SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role",
        SUPABASE_SECRET_KEY: "secret-key",
        MACHINE_JWT_PRIVATE_JWK: "private-jwk",
      },
      { PORTAL_API_KEY: "allowed-key" },
    );

    expect(environment).toEqual({
      PATH: "/local/bin",
      PORTAL_API_KEY: "allowed-key",
    });
  });

  test("serializes only the supplied Bruno variables", () => {
    const output = serializeBrunoDotEnv({
      PORTAL_API_KEY: "allowed-key",
      PORTAL_NO_GRANT_API_KEY: "no-grant-key",
    });

    expect(output).toBe(
      "PORTAL_API_KEY=allowed-key\n" +
        "PORTAL_NO_GRANT_API_KEY=no-grant-key\n",
    );
    expect(output).not.toContain("SERVICE_ROLE");
  });
});
