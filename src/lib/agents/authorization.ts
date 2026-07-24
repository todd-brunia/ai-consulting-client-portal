import type { VerifyAgentCredentialResult } from "./credentials";
import type { AgentCapability } from "./types";

export type HumanIdentity = {
  userId: string;
};

export type HumanPrincipal = {
  kind: "human";
  identity: HumanIdentity;
};

export type MachineGrantSnapshot = {
  organizationIds: readonly string[];
  engagementIds: readonly string[];
};

export type MachinePrincipal = {
  kind: "machine";
  integrationId: string;
  capabilities: readonly AgentCapability[];
  grants: MachineGrantSnapshot;
};

export type AuthorizationContext =
  | HumanPrincipal
  | MachinePrincipal;

export type MachineAuthorizationSnapshot = {
  capabilities: readonly AgentCapability[];
  organizationIds: readonly string[];
  engagementIds: readonly string[];
};

export interface MachineAuthorizationRepository {
  findAuthorizationSnapshot(
    integrationId: string,
  ): Promise<MachineAuthorizationSnapshot | null>;
}

export type ResolveMachineAuthorizationResult =
  | {
      status: "authenticated";
      context: MachinePrincipal;
    }
  | { status: "unauthenticated" };

export type EngagementReadScope = {
  organizationId: string;
  engagementId: string;
};

export type EngagementReadDecision =
  | { status: "allowed" }
  | { status: "denied" }
  | { status: "defer-to-human-policy" };

export function createHumanAuthorizationContext(
  identity: HumanIdentity,
): HumanPrincipal {
  return {
    kind: "human",
    identity: { userId: identity.userId },
  };
}

export async function resolveMachineAuthorizationContext(
  repository: MachineAuthorizationRepository,
  verification: VerifyAgentCredentialResult,
): Promise<ResolveMachineAuthorizationResult> {
  if (verification.status !== "valid") {
    return { status: "unauthenticated" };
  }

  const snapshot = await repository.findAuthorizationSnapshot(
    verification.agentIntegrationId,
  );
  if (!snapshot) {
    return { status: "unauthenticated" };
  }

  return {
    status: "authenticated",
    context: {
      kind: "machine",
      integrationId: verification.agentIntegrationId,
      capabilities: [...snapshot.capabilities],
      grants: {
        organizationIds: [...snapshot.organizationIds],
        engagementIds: [...snapshot.engagementIds],
      },
    },
  };
}

export function authorizeEngagementRead(
  context: AuthorizationContext,
  scope: EngagementReadScope,
): EngagementReadDecision {
  if (context.kind === "human") {
    return { status: "defer-to-human-policy" };
  }

  const { capabilities, grants } = context;
  if (
    !capabilities.includes("engagements:read") ||
    !grants.organizationIds.includes(scope.organizationId) ||
    !grants.engagementIds.includes(scope.engagementId)
  ) {
    return { status: "denied" };
  }

  return { status: "allowed" };
}
