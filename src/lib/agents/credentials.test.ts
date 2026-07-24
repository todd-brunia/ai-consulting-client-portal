import { describe, expect, it } from "vitest";
import {
  issueAgentCredential,
  readBearerCredential,
  verifyAgentCredential,
  type CredentialServiceDependencies,
} from "./credentials";
import type {
  AgentCredentialRecord,
  AgentCredentialRepository,
  CreateAgentCredentialInput,
} from "./types";

const now = new Date("2026-07-24T12:00:00.000Z");
const expiresAt = new Date("2026-10-22T12:00:00.000Z");
const deterministicSecret = "A".repeat(43);
const deterministicApiKey =
  `portal_agent_0011223344556677_${deterministicSecret}`;

function deterministicDependencies(
  currentTime = now,
): CredentialServiceDependencies {
  return {
    now: () => currentTime,
    entropy: {
      lookupPrefix: () => "0011223344556677",
      secret: () => deterministicSecret,
      salt: () => "deterministic-test-salt",
    },
  };
}

class MemoryCredentialRepository implements AgentCredentialRepository {
  credential: AgentCredentialRecord | null = null;
  usedAt: Date | null = null;

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

  async recordCredentialUse(_credentialId: string, usedAt: Date) {
    this.usedAt = usedAt;
  }
}

async function issueFixture(repository: MemoryCredentialRepository) {
  return issueAgentCredential(
    repository,
    {
      agentIntegrationId: "integration-1",
      expiresAt,
    },
    deterministicDependencies(),
  );
}

describe("issueAgentCredential", () => {
  it("returns the complete deterministic test key only from creation", async () => {
    const repository = new MemoryCredentialRepository();

    const issued = await issueFixture(repository);

    expect(issued.apiKey).toBe(deterministicApiKey);
    expect(issued.credential).not.toHaveProperty("secretHash");
    expect(repository.credential?.secretHash).toMatch(/^scrypt\$/);
    expect(repository.credential?.secretHash).not.toContain(
      deterministicApiKey,
    );
  });

  it("rejects an expiry that is not in the future", async () => {
    const repository = new MemoryCredentialRepository();

    await expect(
      issueAgentCredential(
        repository,
        {
          agentIntegrationId: "integration-1",
          expiresAt: now,
        },
        deterministicDependencies(),
      ),
    ).rejects.toThrow("Credential expiry must be in the future");
  });
});

describe("readBearerCredential", () => {
  it("accepts only a bearer authorization header", () => {
    expect(
      readBearerCredential({
        authorizationHeader: `Bearer ${deterministicApiKey}`,
      }),
    ).toBe(deterministicApiKey);
  });

  it.each([
    { queryCredential: deterministicApiKey },
    { formCredential: deterministicApiKey },
    { cookieCredential: deterministicApiKey },
  ])("rejects alternate credential transport: %o", (alternate) => {
    expect(
      readBearerCredential({
        authorizationHeader: `Bearer ${deterministicApiKey}`,
        ...alternate,
      }),
    ).toBeNull();
  });

  it.each([
    null,
    deterministicApiKey,
    `Basic ${deterministicApiKey}`,
    `Bearer ${deterministicApiKey} extra`,
  ])("rejects malformed authorization value: %s", (authorizationHeader) => {
    expect(readBearerCredential({ authorizationHeader })).toBeNull();
  });
});

describe("verifyAgentCredential", () => {
  it("verifies a valid credential and records sanitized use metadata", async () => {
    const repository = new MemoryCredentialRepository();
    await issueFixture(repository);

    await expect(
      verifyAgentCredential(
        repository,
        { authorizationHeader: `Bearer ${deterministicApiKey}` },
        deterministicDependencies(),
      ),
    ).resolves.toEqual({
      status: "valid",
      credentialId: "credential-1",
      agentIntegrationId: "integration-1",
    });
    expect(repository.usedAt).toEqual(now);
  });

  it.each([
    ["unknown", `portal_agent_8899aabbccddeeff_${"B".repeat(43)}`],
    ["wrong secret", `portal_agent_0011223344556677_${"B".repeat(43)}`],
    ["malformed", "not-a-portal-key"],
  ])("returns one generic result for %s credentials", async (_, apiKey) => {
    const repository = new MemoryCredentialRepository();
    await issueFixture(repository);

    await expect(
      verifyAgentCredential(
        repository,
        { authorizationHeader: `Bearer ${apiKey}` },
        deterministicDependencies(),
      ),
    ).resolves.toEqual({ status: "invalid" });
  });

  it("rejects expired credentials", async () => {
    const repository = new MemoryCredentialRepository();
    await issueFixture(repository);

    await expect(
      verifyAgentCredential(
        repository,
        { authorizationHeader: `Bearer ${deterministicApiKey}` },
        deterministicDependencies(expiresAt),
      ),
    ).resolves.toEqual({ status: "invalid" });
  });

  it("rejects revoked credentials", async () => {
    const repository = new MemoryCredentialRepository();
    await issueFixture(repository);
    repository.credential!.revokedAt = now;

    await expect(
      verifyAgentCredential(
        repository,
        { authorizationHeader: `Bearer ${deterministicApiKey}` },
        deterministicDependencies(),
      ),
    ).resolves.toEqual({ status: "invalid" });
  });

  it("never returns a secret or verification hash", async () => {
    const repository = new MemoryCredentialRepository();
    await issueFixture(repository);

    const result = await verifyAgentCredential(
      repository,
      { authorizationHeader: `Bearer ${deterministicApiKey}` },
      deterministicDependencies(),
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(deterministicApiKey);
    expect(serialized).not.toContain("scrypt");
    expect(result).not.toHaveProperty("secretHash");
  });
});
