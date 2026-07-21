export type EngagementRecord = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  created_at: string;
};

export function serializeEngagements(records: EngagementRecord[]) {
  return {
    jsonapi: { version: "1.1" },
    data: records.map((item) => ({
      type: "engagements",
      id: item.id,
      attributes: {
        name: item.name,
        status: item.status,
        "created-at": item.created_at,
      },
      relationships: {
        organization: {
          data: { type: "organizations", id: item.organization_id },
        },
      },
    })),
  };
}
