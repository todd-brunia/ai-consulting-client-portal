import { describe, expect, it, vi } from "vitest";
import {
  loadVisibleEngagements,
  type EngagementServiceDependencies,
  type VisibleEngagement,
} from "./service";

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
