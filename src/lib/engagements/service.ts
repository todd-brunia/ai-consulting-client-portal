import { createClient } from "@/lib/supabase/server";
import type { AuthorizationContext } from "@/lib/agents/authorization";
import { loadMachineVisibleEngagements } from "@/lib/agents/machine-database";

export type VisibleEngagement = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  created_at: string;
  organizations: { name: string }[];
};

export type LoadVisibleEngagementsResult =
  | {
      status: "success";
      engagements: VisibleEngagement[];
    }
  | {
      status: "unauthenticated";
    }
  | {
      status: "query_failed";
    };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type EngagementServiceDependencies = {
  createSupabaseClient?: () => Promise<SupabaseClient>;
};

export type AuthorizedEngagementServiceDependencies = {
  loadHumanEngagements?: () => Promise<LoadVisibleEngagementsResult>;
  loadMachineEngagements?: typeof loadMachineVisibleEngagements;
};

export async function loadVisibleEngagements(
  dependencies: EngagementServiceDependencies = {},
): Promise<LoadVisibleEngagementsResult> {
  const supabase = await (
    dependencies.createSupabaseClient ?? createClient
  )();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims?.sub) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("engagements")
    .select(
      "id, organization_id, name, status, created_at, organizations(name)",
    )
    .order("created_at", { ascending: false });

  if (error || !data) {
    return { status: "query_failed" };
  }

  return {
    status: "success",
    engagements: data,
  };
}

export async function loadAuthorizedEngagements(
  context: AuthorizationContext,
  dependencies: AuthorizedEngagementServiceDependencies = {},
): Promise<LoadVisibleEngagementsResult> {
  if (context.kind === "human") {
    return (
      dependencies.loadHumanEngagements ?? loadVisibleEngagements
    )();
  }

  return (
    dependencies.loadMachineEngagements ??
    loadMachineVisibleEngagements
  )(context);
}
