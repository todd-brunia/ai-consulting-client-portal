import { describe, expect, it, vi } from "vitest";
import {
  loadAuthorizedEngagements,
  loadVisibleEngagements,
  type EngagementServiceDependencies,
  type VisibleEngagement,
} from "./service";
import type {
  HumanPrincipal,
  MachinePrincipal,
} from "@/lib/agents/authorization";

const engagements: VisibleEngagement[] = [
  {
    id: "engagement-1",
    organization_id: "organization-1",
    name: "Portal exploration",
    status: "exploring",
    created_at: "2026-07-21T12:00:00Z",
    organizations: [{ name: "Example organization" }],
  },
];

function createDependencies({
  subject = "user-1",
  data = engagements,
  error = null,
}: {
  subject?: string | null;
  data?: VisibleEngagement[] | null;
  error?: { message: string } | null;
} = {}) {
  const order = vi.fn().mockResolvedValue({ data, error });
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: subject ? { sub: subject } : null },
  });
  const createSupabaseClient = vi.fn().mockResolvedValue({
    auth: { getClaims },
    from,
  });

  return {
    dependencies: {
      createSupabaseClient,
    } as unknown as EngagementServiceDependencies,
    createSupabaseClient,
    getClaims,
    from,
    select,
    order,
  };
}

describe("loadVisibleEngagements", () => {
  it("returns unauthenticated without querying engagements", async () => {
    const { dependencies, from } = createDependencies({ subject: null });

    await expect(loadVisibleEngagements(dependencies)).resolves.toEqual({
      status: "unauthenticated",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("owns the visible engagement projection and ordering", async () => {
    const { dependencies, from, select, order } = createDependencies();

    await expect(loadVisibleEngagements(dependencies)).resolves.toEqual({
      status: "success",
      engagements,
    });
    expect(from).toHaveBeenCalledWith("engagements");
    expect(select).toHaveBeenCalledWith(
      "id, organization_id, name, status, created_at, organizations(name)",
    );
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns a transport-neutral query failure", async () => {
    const { dependencies } = createDependencies({
      data: null,
      error: { message: "database details" },
    });

    await expect(loadVisibleEngagements(dependencies)).resolves.toEqual({
      status: "query_failed",
    });
  });
});

describe("loadAuthorizedEngagements", () => {
  it("dispatches a human context to the existing human service", async () => {
    const context: HumanPrincipal = {
      kind: "human",
      identity: { userId: "human-1" },
    };
    const loadHumanEngagements = vi.fn().mockResolvedValue({
      status: "success",
      engagements,
    });
    const loadMachineEngagements = vi.fn();

    await expect(
      loadAuthorizedEngagements(context, {
        loadHumanEngagements,
        loadMachineEngagements,
      }),
    ).resolves.toEqual({ status: "success", engagements });
    expect(loadHumanEngagements).toHaveBeenCalledOnce();
    expect(loadMachineEngagements).not.toHaveBeenCalled();
  });

  it("dispatches only a machine context to the RLS-backed machine service", async () => {
    const context: MachinePrincipal = {
      kind: "machine",
      integrationId: "11111111-1111-4111-8111-111111111111",
      capabilities: ["engagements:read"],
      grants: {
        organizationIds: ["organization-1"],
        engagementIds: ["engagement-1"],
      },
    };
    const loadHumanEngagements = vi.fn();
    const loadMachineEngagements = vi.fn().mockResolvedValue({
      status: "success",
      engagements,
    });

    await expect(
      loadAuthorizedEngagements(context, {
        loadHumanEngagements,
        loadMachineEngagements,
      }),
    ).resolves.toEqual({ status: "success", engagements });
    expect(loadMachineEngagements).toHaveBeenCalledWith(context);
    expect(loadHumanEngagements).not.toHaveBeenCalled();
  });
});
