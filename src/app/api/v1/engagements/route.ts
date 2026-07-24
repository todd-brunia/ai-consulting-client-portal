import { loadVisibleEngagements } from "@/lib/engagements/service";
import { serializeEngagements } from "@/lib/json-api";

const mediaType = "application/vnd.api+json";

export async function GET() {
  const result = await loadVisibleEngagements();

  if (result.status === "unauthenticated") {
    return Response.json(
      {
        errors: [
          {
            status: "401",
            code: "unauthorized",
            title: "Authentication required",
          },
        ],
      },
      { status: 401, headers: { "content-type": mediaType } },
    );
  }

  if (result.status === "query_failed") {
    return Response.json(
      {
        errors: [
          {
            status: "500",
            code: "query_failed",
            title: "Engagements could not be loaded",
          },
        ],
      },
      { status: 500, headers: { "content-type": mediaType } },
    );
  }

  return Response.json(serializeEngagements(result.engagements), {
    headers: { "content-type": mediaType },
  });
}
