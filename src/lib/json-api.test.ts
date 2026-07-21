import { describe, expect, it } from "vitest";
import { serializeEngagements } from "./json-api";

describe("serializeEngagements", () => {
  it("keeps JSON:API resource identity separate from attributes", () => {
    const document = serializeEngagements([{
      id: "engagement-1",
      organization_id: "organization-1",
      name: "Portal exploration",
      status: "exploring",
      created_at: "2026-07-21T12:00:00Z",
    }]);

    expect(document.jsonapi.version).toBe("1.1");
    expect(document.data[0]).toMatchObject({
      type: "engagements",
      id: "engagement-1",
      attributes: { name: "Portal exploration", status: "exploring" },
      relationships: {
        organization: { data: { type: "organizations", id: "organization-1" } },
      },
    });
  });
});
