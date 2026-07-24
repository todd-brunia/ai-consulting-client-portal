import { afterEach, describe, expect, it, vi } from "vitest";
import type { MachinePrincipal } from "@/lib/agents/authorization";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createClient: vi.fn(),
  loadAuthorizedEngagements: vi.fn(),
  loadVisibleEngagements: vi.fn(),
}));

vi.mock("@/lib/agents/engagement-api-auth", () => ({
  resolveEngagementApiAuthentication: mocks.authenticate,
}));
vi.mock("@/lib/engagements/service", () => ({
  loadAuthorizedEngagements: mocks.loadAuthorizedEngagements,
  loadVisibleEngagements: mocks.loadVisibleEngagements,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { GET } from "./route";

const integrationId = "11111111-1111-4111-8111-111111111111";
const machineContext: MachinePrincipal = {
  kind: "machine",
  integrationId,
  capabilities: ["engagements:read"],
  grants: {
    organizationIds: ["organization-1"],
    engagementIds: ["engagement-1"],
  },
};

function request() {
  return new Request("http://localhost/api/v1/engagements");
}

describe("GET /api/v1/engagements machine auditing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("audits a successful request after resolving a machine principal", async () => {
    const audit = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: vi.fn().mockResolvedValue({ data: null }) },
    });
    mocks.authenticate.mockResolvedValue({
      status: "authenticated",
      context: machineContext,
    });
    mocks.loadAuthorizedEngagements.mockResolvedValue({
      status: "success",
      engagements: [],
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(audit).toHaveBeenCalledWith(
      "[machine-request-audit]",
      expect.objectContaining({
        event: "machine_request",
        principal: { kind: "machine", integrationId },
        requestCategory: "engagements.read",
        result: "success",
        timestamp: expect.any(String),
      }),
    );
  });

  it("audits a rejected request when the machine principal is known", async () => {
    const audit = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: vi.fn().mockResolvedValue({ data: null }) },
    });
    mocks.authenticate.mockResolvedValue({
      status: "forbidden",
      context: machineContext,
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(audit).toHaveBeenCalledWith(
      "[machine-request-audit]",
      expect.objectContaining({
        principal: { kind: "machine", integrationId },
        requestCategory: "engagements.read",
        result: "rejected",
      }),
    );
    expect(mocks.loadAuthorizedEngagements).not.toHaveBeenCalled();
  });

  it("does not audit a rejection without a resolved principal", async () => {
    const audit = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: vi.fn().mockResolvedValue({ data: null }) },
    });
    mocks.authenticate.mockResolvedValue({ status: "unauthenticated" });

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(audit).not.toHaveBeenCalled();
  });
});
