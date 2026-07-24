import { describe, expect, it, vi } from "vitest";
import type {
  MachineAuthorizationRepository,
  MachineAuthorizationSnapshot,
} from "./authorization";
import {
  issueAgentCredential,
  type CredentialServiceDependencies,
} from "./credentials";
import { resolveEngagementApiAuthentication } from "./engagement-api-auth";
import type {
  AgentCredentialRecord,
  AgentCredentialRepository,
  CreateAgentCredentialInput,
} from "./types";

const now = new Date("2026-07-24T12:00:00.000Z");
const expiresAt = new Date("2026-07-24T13:00:00.000Z");
const integrationId = "11111111-1111-4111-8111-111111111111";
const deterministicSecret = "A".repeat(43);
const deterministicApiKey =
  `portal_agent_0011223344556677_${deterministicSecret}`;
const credentialDependencies: CredentialServiceDependencies = {
  now: () => now,
  entropy: {
    lookupPrefix: () => "0011223344556677",
    secret: () => deterministicSecret,
    salt: () => "engagement-api-test-salt",
  },
};

class CredentialRepository implements AgentCredentialRepository {
  credential: AgentCredentialRecord | null = null;
  recordCredentialUse = vi.fn(async () => undefined);

  async createCredential(input: CreateAgentCredentialInput) {
    this.credential = {
      id: "credential-1",
      agentIntegrationId: input.agentIntegrationId,
      lookupPrefix: input.lookupPrefix,
      secretHash: input.secretHash,
      createdAt: now,
      expiresAt: input.expiresAt,
      lastUsedAt: null,
      revokedAt: null,
    };
    return this.credential;
  }

  async findCredentialByPrefix(lookupPrefix: string) {
    return this.credential?.lookupPrefix === lookupPrefix
      ? this.credential
      : null;
  }
}

class AuthorizationRepository
  implements MachineAuthorizationRepository
{
  findAuthorizationSnapshot = vi.fn(
    async (): Promise<MachineAuthorizationSnapshot | null> => ({
      capabilities: ["engagements:read"],
      organizationIds: ["organization-1"],
      engagementIds: ["engagement-1"],
    }),
  );
}

async function createDependencies() {
  const credentials = new CredentialRepository();
  const authorization = new AuthorizationRepository();
  await issueAgentCredential(
    credentials,
    { agentIntegrationId: integrationId, expiresAt },
    credentialDependencies,
  );

  return {
    credentials,
    authorization,
    dependencies: {
      credentialRepository: credentials,
      authorizationRepository: authorization,
      credentialService: { now: () => now },
    },
  };
}

describe("resolveEngagementApiAuthentication", () => {
  it("preserves a human identity when no bearer credential is present", async () => {
    const { dependencies } = await createDependencies();

    await expect(
      resolveEngagementApiAuthentication(
        {
          authorizationHeader: null,
          humanUserId: "human-1",
        },
        dependencies,
      ),
    ).resolves.toEqual({
      status: "authenticated",
      context: {
        kind: "human",
        identity: { userId: "human-1" },
      },
    });
  });

  it("rejects a valid human session combined with any bearer attempt", async () => {
    const { credentials, authorization, dependencies } =
      await createDependencies();

    await expect(
      resolveEngagementApiAuthentication(
        {
          authorizationHeader: "Bearer malformed",
          humanUserId: "human-1",
        },
        dependencies,
      ),
    ).resolves.toEqual({ status: "unauthenticated" });
    expect(credentials.recordCredentialUse).not.toHaveBeenCalled();
    expect(
      authorization.findAuthorizationSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("authenticates a valid, capable machine without transport details in context", async () => {
    const { dependencies } = await createDependencies();

    const result = await resolveEngagementApiAuthentication(
      {
        authorizationHeader: `Bearer ${deterministicApiKey}`,
        humanUserId: null,
      },
      dependencies,
    );

    expect(result).toEqual({
      status: "authenticated",
      context: {
        kind: "machine",
        integrationId,
        capabilities: ["engagements:read"],
        grants: {
          organizationIds: ["organization-1"],
          engagementIds: ["engagement-1"],
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain(deterministicApiKey);
    expect(result).not.toHaveProperty("authorizationHeader");
  });

  it("returns forbidden only after valid machine authentication lacks capability", async () => {
    const { authorization, dependencies } =
      await createDependencies();
    authorization.findAuthorizationSnapshot.mockResolvedValue({
      capabilities: [],
      organizationIds: ["organization-1"],
      engagementIds: ["engagement-1"],
    });

    await expect(
      resolveEngagementApiAuthentication(
        {
          authorizationHeader: `Bearer ${deterministicApiKey}`,
          humanUserId: null,
        },
        dependencies,
      ),
    ).resolves.toEqual({
      status: "forbidden",
      context: {
        kind: "machine",
        integrationId,
        capabilities: [],
        grants: {
          organizationIds: ["organization-1"],
          engagementIds: ["engagement-1"],
        },
      },
    });
  });

  it.each([
    ["missing", null],
    ["malformed", "Bearer malformed"],
    [
      "unknown",
      `Bearer portal_agent_8899aabbccddeeff_${"B".repeat(43)}`,
    ],
  ])("returns one unauthenticated result for %s authentication", async (_, header) => {
    const { dependencies } = await createDependencies();

    await expect(
      resolveEngagementApiAuthentication(
        {
          authorizationHeader: header,
          humanUserId: null,
        },
        dependencies,
      ),
    ).resolves.toEqual({ status: "unauthenticated" });
  });
});
