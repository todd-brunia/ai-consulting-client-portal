export const agentCapabilities = ["engagements:read"] as const;

export type AgentCapability = (typeof agentCapabilities)[number];

export type AgentIntegration = {
  id: string;
  name: string;
  createdAt: Date;
};

export type AgentCredentialRecord = {
  id: string;
  agentIntegrationId: string;
  lookupPrefix: string;
  secretHash: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export type AgentOrganizationGrant = {
  agentIntegrationId: string;
  organizationId: string;
};

export type AgentEngagementGrant = {
  agentIntegrationId: string;
  engagementId: string;
};

export type AgentCredentialMetadata = Omit<
  AgentCredentialRecord,
  "secretHash"
>;

export type CreateAgentCredentialInput = {
  agentIntegrationId: string;
  lookupPrefix: string;
  secretHash: string;
  expiresAt: Date;
};

export interface AgentCredentialRepository {
  createCredential(
    input: CreateAgentCredentialInput,
  ): Promise<AgentCredentialRecord>;
  findCredentialByPrefix(
    lookupPrefix: string,
  ): Promise<AgentCredentialRecord | null>;
  recordCredentialUse(credentialId: string, usedAt: Date): Promise<void>;
}
