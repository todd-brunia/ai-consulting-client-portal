import { describe, expect, it } from "vitest";
import {
  authorizeEngagementRead,
  createHumanAuthorizationContext,
  resolveMachineAuthorizationContext,
  type MachinePrincipal,
  type MachineAuthorizationRepository,
  type MachineAuthorizationSnapshot,
} from "./authorization";

const allowedScope = {
  organizationId: "organization-1",
  engagementId: "engagement-1",
};

class MemoryAuthorizationRepository
  implements MachineAuthorizationRepository
{
  calls: string[] = [];

  constructor(
    private readonly snapshot: MachineAuthorizationSnapshot | null,
  ) {}

  async findAuthorizationSnapshot(integrationId: string) {
    this.calls.push(integrationId);
    return this.snapshot;
  }
}

function machineContext(
  overrides: Partial<MachineAuthorizationSnapshot> = {},
): MachinePrincipal {
  return {
    kind: "machine",
    integrationId: "integration-1",
    capabilities: overrides.capabilities ?? ["engagements:read"],
    grants: {
      organizationIds:
        overrides.organizationIds ?? ["organization-1"],
      engagementIds: overrides.engagementIds ?? ["engagement-1"],
    },
  };
}

describe("authorization contexts", () => {
  it("keeps a human identity distinct from a machine principal", () => {
    expect(
      createHumanAuthorizationContext({ userId: "human-1" }),
    ).toEqual({
      kind: "human",
      identity: { userId: "human-1" },
    });
  });

  it("resolves a verified credential to a sanitized grant snapshot", async () => {
    const source: MachineAuthorizationSnapshot = {
      capabilities: ["engagements:read"],
      organizationIds: ["organization-1"],
      engagementIds: ["engagement-1"],
    };
    const repository = new MemoryAuthorizationRepository(source);

    const result = await resolveMachineAuthorizationContext(repository, {
      status: "valid",
      credentialId: "credential-1",
      agentIntegrationId: "integration-1",
    });

    expect(result).toEqual({
      status: "authenticated",
      context: machineContext(),
    });
    expect(repository.calls).toEqual(["integration-1"]);
    expect(result).not.toHaveProperty("credentialId");
    if (result.status === "authenticated") {
      expect(result.context.capabilities).not.toBe(
        source.capabilities,
      );
      expect(result.context.grants.organizationIds).not.toBe(
        source.organizationIds,
      );
    }
  });

  it("returns one unauthenticated result without loading grants for an invalid credential", async () => {
    const repository = new MemoryAuthorizationRepository(null);

    await expect(
      resolveMachineAuthorizationContext(repository, {
        status: "invalid",
      }),
    ).resolves.toEqual({ status: "unauthenticated" });
    expect(repository.calls).toEqual([]);
  });

  it("does not disclose whether a verified integration is missing", async () => {
    const repository = new MemoryAuthorizationRepository(null);

    await expect(
      resolveMachineAuthorizationContext(repository, {
        status: "valid",
        credentialId: "credential-1",
        agentIntegrationId: "missing-integration",
      }),
    ).resolves.toEqual({ status: "unauthenticated" });
  });
});

describe("authorizeEngagementRead", () => {
  it("allows a machine principal with capability and matching grants", () => {
    expect(
      authorizeEngagementRead(machineContext(), allowedScope),
    ).toEqual({ status: "allowed" });
  });

  it("denies a missing capability without disclosing the reason", () => {
    expect(
      authorizeEngagementRead(
        machineContext({ capabilities: [] }),
        allowedScope,
      ),
    ).toEqual({ status: "denied" });
  });

  it("denies a cross-tenant organization without disclosing the reason", () => {
    expect(
      authorizeEngagementRead(machineContext(), {
        ...allowedScope,
        organizationId: "organization-2",
      }),
    ).toEqual({ status: "denied" });
  });

  it("denies an engagement outside the allowlist without disclosing the reason", () => {
    expect(
      authorizeEngagementRead(machineContext(), {
        ...allowedScope,
        engagementId: "engagement-2",
      }),
    ).toEqual({ status: "denied" });
  });

  it("leaves human session authorization to the existing human policy", () => {
    const context = createHumanAuthorizationContext({
      userId: "human-1",
    });

    expect(authorizeEngagementRead(context, allowedScope)).toEqual({
      status: "defer-to-human-policy",
    });
  });
});
