import { createClient } from "@supabase/supabase-js";
import type {
  MachineAuthorizationRepository,
  MachineAuthorizationSnapshot,
} from "./authorization";
import type {
  AgentCapability,
  AgentCredentialRecord,
  AgentCredentialVerificationRepository,
} from "./types";

type MachineAuthDatabase = {
  public: {
    Tables: {
      agent_credentials: {
        Row: {
          id: string;
          agent_integration_id: string;
          lookup_prefix: string;
          secret_hash: string;
          created_at: string;
          expires_at: string;
          last_used_at: string | null;
          revoked_at: string | null;
        };
        Insert: never;
        Update: { last_used_at?: string | null };
        Relationships: [];
      };
      agent_integrations: {
        Row: { id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      agent_capabilities: {
        Row: {
          agent_integration_id: string;
          capability: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      agent_organization_grants: {
        Row: {
          agent_integration_id: string;
          organization_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      agent_engagement_grants: {
        Row: {
          agent_integration_id: string;
          engagement_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type PrivilegedClient = ReturnType<
  typeof createClient<MachineAuthDatabase>
>;

function createPrivilegedClient(): PrivilegedClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error("Machine authentication storage is not configured");
  }

  return createClient<MachineAuthDatabase>(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function asDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

export class SupabaseCredentialVerificationRepository
  implements AgentCredentialVerificationRepository
{
  constructor(private readonly client: PrivilegedClient) {}

  async findCredentialByPrefix(
    lookupPrefix: string,
  ): Promise<AgentCredentialRecord | null> {
    const { data, error } = await this.client
      .from("agent_credentials")
      .select(
        "id, agent_integration_id, lookup_prefix, secret_hash, created_at, expires_at, last_used_at, revoked_at",
      )
      .eq("lookup_prefix", lookupPrefix)
      .maybeSingle();

    if (error) {
      throw new Error("Machine credential lookup failed");
    }
    if (!data) return null;

    return {
      id: data.id,
      agentIntegrationId: data.agent_integration_id,
      lookupPrefix: data.lookup_prefix,
      secretHash: data.secret_hash,
      createdAt: new Date(data.created_at),
      expiresAt: new Date(data.expires_at),
      lastUsedAt: asDate(data.last_used_at),
      revokedAt: asDate(data.revoked_at),
    };
  }

  async recordCredentialUse(
    credentialId: string,
    usedAt: Date,
  ): Promise<void> {
    const { error } = await this.client
      .from("agent_credentials")
      .update({ last_used_at: usedAt.toISOString() })
      .eq("id", credentialId);

    if (error) {
      throw new Error("Machine credential use could not be recorded");
    }
  }
}

export class SupabaseMachineAuthorizationRepository
  implements MachineAuthorizationRepository
{
  constructor(private readonly client: PrivilegedClient) {}

  async findAuthorizationSnapshot(
    integrationId: string,
  ): Promise<MachineAuthorizationSnapshot | null> {
    const integrationResult = await this.client
      .from("agent_integrations")
      .select("id")
      .eq("id", integrationId)
      .maybeSingle();

    if (integrationResult.error) {
      throw new Error("Machine authorization lookup failed");
    }
    if (!integrationResult.data) return null;

    const [capabilities, organizations, engagements] =
      await Promise.all([
        this.client
          .from("agent_capabilities")
          .select("capability")
          .eq("agent_integration_id", integrationId),
        this.client
          .from("agent_organization_grants")
          .select("organization_id")
          .eq("agent_integration_id", integrationId),
        this.client
          .from("agent_engagement_grants")
          .select("engagement_id")
          .eq("agent_integration_id", integrationId),
      ]);

    if (
      capabilities.error ||
      organizations.error ||
      engagements.error
    ) {
      throw new Error("Machine authorization lookup failed");
    }

    return {
      capabilities: capabilities.data.map(
        ({ capability }) => capability as AgentCapability,
      ),
      organizationIds: organizations.data.map(
        ({ organization_id }) => organization_id,
      ),
      engagementIds: engagements.data.map(
        ({ engagement_id }) => engagement_id,
      ),
    };
  }
}

export function createMachineAuthenticationRepositories() {
  const client = createPrivilegedClient();
  return {
    credentials: new SupabaseCredentialVerificationRepository(client),
    authorization: new SupabaseMachineAuthorizationRepository(client),
  };
}
