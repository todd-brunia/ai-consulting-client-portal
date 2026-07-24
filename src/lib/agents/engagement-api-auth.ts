import {
  createHumanAuthorizationContext,
  resolveMachineAuthorizationContext,
  type AuthorizationContext,
  type MachineAuthorizationRepository,
} from "./authorization";
import {
  verifyAgentCredential,
  type CredentialServiceDependencies,
} from "./credentials";
import { createMachineAuthenticationRepositories } from "./supabase-repositories";
import type { AgentCredentialVerificationRepository } from "./types";

export type EngagementApiAuthenticationInput = {
  authorizationHeader: string | null;
  humanUserId: string | null;
};

export type EngagementApiAuthenticationResult =
  | {
      status: "authenticated";
      context: AuthorizationContext;
    }
  | { status: "unauthenticated" }
  | { status: "forbidden" };

export type EngagementApiAuthenticationDependencies = {
  credentialRepository?: AgentCredentialVerificationRepository;
  authorizationRepository?: MachineAuthorizationRepository;
  credentialService?: CredentialServiceDependencies;
};

function isBearerAttempt(value: string | null): boolean {
  return value ? /^Bearer(?:\s|$)/i.test(value) : false;
}

export async function resolveEngagementApiAuthentication(
  input: EngagementApiAuthenticationInput,
  dependencies: EngagementApiAuthenticationDependencies = {},
): Promise<EngagementApiAuthenticationResult> {
  const bearerAttempt = isBearerAttempt(input.authorizationHeader);

  if (input.humanUserId && bearerAttempt) {
    return { status: "unauthenticated" };
  }

  if (!bearerAttempt) {
    if (!input.humanUserId) return { status: "unauthenticated" };
    return {
      status: "authenticated",
      context: createHumanAuthorizationContext({
        userId: input.humanUserId,
      }),
    };
  }

  const hasCredentialRepository = Boolean(
    dependencies.credentialRepository,
  );
  const hasAuthorizationRepository = Boolean(
    dependencies.authorizationRepository,
  );
  if (hasCredentialRepository !== hasAuthorizationRepository) {
    throw new Error(
      "Machine authentication repositories are incomplete",
    );
  }
  const repositories = hasCredentialRepository
    ? {
        credentials: dependencies.credentialRepository!,
        authorization: dependencies.authorizationRepository!,
      }
    : createMachineAuthenticationRepositories();
  const verification = await verifyAgentCredential(
    repositories.credentials,
    { authorizationHeader: input.authorizationHeader },
    dependencies.credentialService,
  );
  const resolution = await resolveMachineAuthorizationContext(
    repositories.authorization,
    verification,
  );

  if (resolution.status !== "authenticated") {
    return { status: "unauthenticated" };
  }
  if (
    !resolution.context.capabilities.includes("engagements:read")
  ) {
    return { status: "forbidden" };
  }

  return resolution;
}
