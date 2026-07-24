// @vitest-environment node

import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  importJWK,
  type JWK,
  type JWTPayload,
} from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { MachinePrincipal } from "./authorization";
import {
  loadMachineVisibleEngagements,
  machineDatabaseRole,
  machineJwtAlgorithm,
  machineJwtAudience,
  machineJwtIssuer,
  machineJwtLifetimeSeconds,
  mintMachineDatabaseToken,
  verifyMachineDatabaseToken,
} from "./machine-database";

const now = new Date("2026-07-24T12:00:00.000Z");
const integrationId = "11111111-1111-4111-8111-111111111111";
const principal: MachinePrincipal = {
  kind: "machine",
  integrationId,
  capabilities: ["engagements:read"],
  grants: {
    organizationIds: ["organization-secret-scope"],
    engagementIds: ["engagement-secret-scope"],
  },
};

let privateJwk: JWK;
let publicJwk: JWK;

beforeAll(async () => {
  const keys = await generateKeyPair(machineJwtAlgorithm, {
    extractable: true,
  });
  privateJwk = {
    ...(await exportJWK(keys.privateKey)),
    alg: machineJwtAlgorithm,
    kid: "machine-test-key",
  };
  publicJwk = {
    ...(await exportJWK(keys.publicKey)),
    alg: machineJwtAlgorithm,
    kid: "machine-test-key",
  };
});

async function signClaims(
  payload: JWTPayload,
  {
    issuer = machineJwtIssuer,
    audience = machineJwtAudience,
    expiration = Math.floor(now.getTime() / 1000) + 60,
  }: {
    issuer?: string;
    audience?: string;
    expiration?: number;
  } = {},
) {
  const key = await importJWK(privateJwk, machineJwtAlgorithm);
  return new SignJWT(payload)
    .setProtectedHeader({
      alg: machineJwtAlgorithm,
      kid: privateJwk.kid,
      typ: "JWT",
    })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(expiration)
    .sign(key);
}

describe("machine database JWT", () => {
  it("mints a short-lived token with stable identity but no grants or capabilities", async () => {
    const token = await mintMachineDatabaseToken(
      principal,
      { privateJwk },
      now,
    );
    const result = await verifyMachineDatabaseToken(
      token,
      { publicJwk },
      now,
    );
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );

    expect(result).toEqual({ integrationId });
    expect(payload).toMatchObject({
      iss: machineJwtIssuer,
      aud: machineJwtAudience,
      role: machineDatabaseRole,
      machine_integration_id: integrationId,
    });
    expect(payload.exp - payload.iat).toBe(machineJwtLifetimeSeconds);
    expect(payload).not.toHaveProperty("capabilities");
    expect(payload).not.toHaveProperty("organizationIds");
    expect(payload).not.toHaveProperty("engagementIds");
    expect(token).not.toContain("organization-secret-scope");
    expect(token).not.toContain("engagement-secret-scope");
  });

  it.each([
    ["wrong issuer", { issuer: "untrusted-issuer" }],
    ["wrong audience", { audience: "untrusted-audience" }],
    [
      "expired token",
      { expiration: Math.floor(now.getTime() / 1000) - 1 },
    ],
  ])("rejects a token with %s", async (_, options) => {
    const token = await signClaims(
      {
        role: machineDatabaseRole,
        machine_integration_id: integrationId,
      },
      options,
    );

    await expect(
      verifyMachineDatabaseToken(token, { publicJwk }, now),
    ).rejects.toThrow();
  });

  it.each([
    ["wrong role", { role: "authenticated", machine_integration_id: integrationId }],
    ["missing integration", { role: machineDatabaseRole }],
    [
      "malformed integration",
      {
        role: machineDatabaseRole,
        machine_integration_id: "caller-controlled",
      },
    ],
    [
      "embedded scope",
      {
        role: machineDatabaseRole,
        machine_integration_id: integrationId,
        organization_ids: ["organization-1"],
      },
    ],
  ])("rejects %s claims", async (_, claims) => {
    const token = await signClaims(claims);

    await expect(
      verifyMachineDatabaseToken(token, { publicJwk }, now),
    ).rejects.toThrow();
  });

  it("rejects an unexpected signing-key identifier", async () => {
    const token = await mintMachineDatabaseToken(
      principal,
      { privateJwk },
      now,
    );

    await expect(
      verifyMachineDatabaseToken(
        token,
        {
          publicJwk: {
            ...publicJwk,
            kid: "unexpected-key",
          },
        },
        now,
      ),
    ).rejects.toThrow("Machine database token claims are invalid");
  });

  it("rejects a forged signature", async () => {
    const attackerKeys = await generateKeyPair(machineJwtAlgorithm, {
      extractable: true,
    });
    const attackerPrivateJwk = {
      ...(await exportJWK(attackerKeys.privateKey)),
      alg: machineJwtAlgorithm,
      kid: "attacker-key",
    };
    const forged = await mintMachineDatabaseToken(
      principal,
      { privateJwk: attackerPrivateJwk },
      now,
    );

    await expect(
      verifyMachineDatabaseToken(forged, { publicJwk }, now),
    ).rejects.toThrow();
  });

  it("rejects a token signed with the wrong algorithm", async () => {
    const rsaKeys = await generateKeyPair("RS256", {
      extractable: true,
    });
    const rsaPrivateJwk = {
      ...(await exportJWK(rsaKeys.privateKey)),
      alg: "RS256",
      kid: "wrong-algorithm-key",
    };
    const rsaKey = await importJWK(rsaPrivateJwk, "RS256");
    const token = await new SignJWT({
      role: machineDatabaseRole,
      machine_integration_id: integrationId,
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: rsaPrivateJwk.kid,
        typ: "JWT",
      })
      .setIssuer(machineJwtIssuer)
      .setAudience(machineJwtAudience)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(now.getTime() / 1000) + 60)
      .sign(rsaKey);

    await expect(
      verifyMachineDatabaseToken(token, { publicJwk }, now),
    ).rejects.toThrow();
  });

  it("requires an ES256 private signing key with an identifier", async () => {
    await expect(
      mintMachineDatabaseToken(
        principal,
        {
          privateJwk: {
            ...privateJwk,
            alg: "RS256",
          },
        },
        now,
      ),
    ).rejects.toThrow(
      "A private ES256 machine JWT signing JWK is required",
    );
  });
});

describe("loadMachineVisibleEngagements", () => {
  it("keeps the token inside a server client and leaves row scope to RLS", async () => {
    const engagements = [
      {
        id: "engagement-1",
        organization_id: "organization-1",
        name: "Allowed engagement",
        status: "active",
        created_at: "2026-07-24T12:00:00.000Z",
        organizations: [{ name: "Allowed organization" }],
      },
    ];
    const order = vi.fn().mockResolvedValue({
      data: engagements,
      error: null,
    });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    let internalToken: string | undefined;
    const createSupabaseClient = vi.fn(
      (_url, _key, options) => {
        void options.accessToken().then((token: string) => {
          internalToken = token;
        });
        return { from };
      },
    );

    const result = await loadMachineVisibleEngagements(principal, {
      now: () => now,
      signingConfig: { privateJwk },
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_test",
      createSupabaseClient:
        createSupabaseClient as unknown as typeof import("@supabase/supabase-js").createClient,
    });
    await vi.waitFor(() => expect(internalToken).toBeDefined());

    expect(result).toEqual({ status: "success", engagements });
    expect(JSON.stringify(result)).not.toContain(internalToken);
    expect(from).toHaveBeenCalledWith("engagements");
    expect(select).toHaveBeenCalledWith(
      "id, organization_id, name, status, created_at, organizations(name)",
    );
    expect(order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
  });

  it("rejects a human principal before creating database access", async () => {
    const createSupabaseClient = vi.fn();

    await expect(
      loadMachineVisibleEngagements(
        {
          kind: "human",
          identity: { userId: "human-1" },
        } as unknown as MachinePrincipal,
        {
          now: () => now,
          signingConfig: { privateJwk },
          supabaseUrl: "https://project.supabase.co",
          publishableKey: "sb_publishable_test",
          createSupabaseClient:
            createSupabaseClient as unknown as typeof import("@supabase/supabase-js").createClient,
        },
      ),
    ).rejects.toThrow("A valid machine principal is required");
    expect(createSupabaseClient).not.toHaveBeenCalled();
  });
});
