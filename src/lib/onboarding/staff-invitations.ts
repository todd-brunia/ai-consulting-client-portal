import { createHash, randomBytes } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type InvitationLifecycleStatus =
  | "pending"
  | "expired"
  | "revoked"
  | "consumed"
  | "replaced";

export type SafeInvitation = {
  id: string;
  organization_id: string;
  organization_name: string;
  invited_email: string;
  role: "client_member";
  status: InvitationLifecycleStatus;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
  replaced_at: string | null;
  replacement_invitation_id: string | null;
  invited_by_application_user_id: string;
  invited_by_email: string;
};

type StaffClient = Awaited<ReturnType<typeof createClient>>;

type LifecycleRpcResult = {
  outcome:
    | "created"
    | "replaced"
    | "revoked"
    | "forbidden"
    | "invalid"
    | "not_found"
    | "conflict";
  invitation?: SafeInvitation;
  replaced_invitation_id?: string;
};

export type StaffAuthorization =
  | { status: "authenticated"; client: StaffClient }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "failed" };

export type LifecycleOperation =
  | { status: "success"; invitation: SafeInvitation }
  | { status: "forbidden" | "invalid" | "not_found" | "conflict" | "failed" };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeInvitationEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 254 && emailPattern.test(normalized)
    ? normalized
    : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function generateInvitationToken(): {
  rawToken: string;
  tokenHash: string;
} {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: createHash("sha256").update(rawToken).digest("hex"),
  };
}

export async function authorizeStaff(
  clientFactory: () => Promise<StaffClient> = createClient,
): Promise<StaffAuthorization> {
  try {
    const client = await clientFactory();
    const { data: claims } = await client.auth.getClaims();
    if (typeof claims?.claims?.sub !== "string") {
      return { status: "unauthenticated" };
    }

    const { data, error } = await client.rpc("has_staff_admin_authority");
    if (error) return { status: "failed" };
    if (data !== true) return { status: "forbidden" };
    return { status: "authenticated", client };
  } catch {
    return { status: "failed" };
  }
}

function mapRpcResult(
  data: LifecycleRpcResult | null,
  error: unknown,
): LifecycleOperation {
  if (error || !data) return { status: "failed" };
  if (
    (data.outcome === "created" ||
      data.outcome === "replaced" ||
      data.outcome === "revoked") &&
    data.invitation
  ) {
    return { status: "success", invitation: data.invitation };
  }
  if (
    data.outcome === "forbidden" ||
    data.outcome === "invalid" ||
    data.outcome === "not_found" ||
    data.outcome === "conflict"
  ) {
    return { status: data.outcome };
  }
  return { status: "failed" };
}

export async function issueInvitation(
  client: StaffClient,
  organizationId: string,
  email: string,
  tokenHash: string,
): Promise<LifecycleOperation> {
  const { data, error } = await client.rpc(
    "staff_issue_organization_invitation",
    {
      target_organization_id: organizationId,
      normalized_email: email,
      invitation_token_hash: tokenHash,
    },
  );
  return mapRpcResult(data as LifecycleRpcResult | null, error);
}

export async function revokeInvitation(
  client: StaffClient,
  invitationId: string,
): Promise<LifecycleOperation> {
  const { data, error } = await client.rpc(
    "staff_revoke_organization_invitation",
    { target_invitation_id: invitationId },
  );
  return mapRpcResult(data as LifecycleRpcResult | null, error);
}

export async function replaceInvitation(
  client: StaffClient,
  invitationId: string,
  tokenHash: string,
): Promise<LifecycleOperation> {
  const { data, error } = await client.rpc(
    "staff_replace_organization_invitation",
    {
      target_invitation_id: invitationId,
      replacement_token_hash: tokenHash,
    },
  );
  return mapRpcResult(data as LifecycleRpcResult | null, error);
}

export async function inspectInvitation(
  client: StaffClient,
  invitationId: string,
): Promise<
  | { status: "success"; invitation: SafeInvitation }
  | { status: "not_found" | "failed" }
> {
  const { data, error } = await client
    .from("organization_invitations")
    .select(
      "id, organization_id, invited_email, role, created_at, expires_at, consumed_at, revoked_at, replaced_at, replacement_invitation_id, invited_by_application_user_id, organizations(name), application_users!organization_invitations_invited_by_application_user_id_fkey(email)",
    )
    .eq("id", invitationId)
    .maybeSingle();
  if (error) return { status: "failed" };
  if (!data) return { status: "not_found" };
  return { status: "success", invitation: toSafeInvitation(data) };
}

export async function listInvitations(
  client: StaffClient,
  organizationId: string,
): Promise<
  | { status: "success"; invitations: SafeInvitation[] }
  | { status: "not_found" | "failed" }
> {
  const organization = await client
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (organization.error) return { status: "failed" };
  if (!organization.data) return { status: "not_found" };

  const { data, error } = await client
    .from("organization_invitations")
    .select(
      "id, organization_id, invited_email, role, created_at, expires_at, consumed_at, revoked_at, replaced_at, replacement_invitation_id, invited_by_application_user_id, organizations(name), application_users!organization_invitations_invited_by_application_user_id_fkey(email)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error || !data) return { status: "failed" };
  return { status: "success", invitations: data.map(toSafeInvitation) };
}

type InvitationQueryRow = {
  id: string;
  organization_id: string;
  invited_email: string;
  role: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
  replaced_at: string | null;
  replacement_invitation_id: string | null;
  invited_by_application_user_id: string;
  organizations: { name: string } | { name: string }[] | null;
  application_users: { email: string } | { email: string }[] | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function deriveStatus(row: InvitationQueryRow): InvitationLifecycleStatus {
  if (row.consumed_at) return "consumed";
  if (row.revoked_at) return "revoked";
  if (row.replaced_at) return "replaced";
  if (new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "pending";
}

function toSafeInvitation(row: InvitationQueryRow): SafeInvitation {
  return {
    id: row.id,
    organization_id: row.organization_id,
    organization_name: firstRelation(row.organizations)?.name ?? "",
    invited_email: row.invited_email,
    role: "client_member",
    status: deriveStatus(row),
    created_at: row.created_at,
    expires_at: row.expires_at,
    consumed_at: row.consumed_at,
    revoked_at: row.revoked_at,
    replaced_at: row.replaced_at,
    replacement_invitation_id: row.replacement_invitation_id,
    invited_by_application_user_id:
      row.invited_by_application_user_id,
    invited_by_email: firstRelation(row.application_users)?.email ?? "",
  };
}

export async function deliverLocalInvitation(
  email: string,
  rawToken: string,
  requestOrigin: string,
): Promise<boolean> {
  try {
    const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    const applicationUrl = new URL(requestOrigin);
    if (
      !["127.0.0.1", "localhost"].includes(supabaseUrl.hostname) ||
      !["127.0.0.1", "localhost"].includes(applicationUrl.hostname)
    ) {
      return false;
    }

    const acceptanceUrl = new URL("/invite", applicationUrl);
    acceptanceUrl.searchParams.set("token", rawToken);
    const provider = createSupabaseClient(
      supabaseUrl.toString(),
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error } = await provider.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: acceptanceUrl.toString(),
        shouldCreateUser: true,
      },
    });
    return !error;
  } catch {
    return false;
  }
}
