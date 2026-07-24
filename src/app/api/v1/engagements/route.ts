import { resolveEngagementApiAuthentication } from "@/lib/agents/engagement-api-auth";
import {
  loadAuthorizedEngagements,
  loadVisibleEngagements,
} from "@/lib/engagements/service";
import { serializeEngagements } from "@/lib/json-api";
import { createClient } from "@/lib/supabase/server";

const mediaType = "application/vnd.api+json";

function errorResponse(
  status: number,
  code: string,
  title: string,
) {
  return Response.json(
    {
      errors: [{ status: String(status), code, title }],
    },
    { status, headers: { "content-type": mediaType } },
  );
}

export async function GET(request: Request) {
  try {
    const humanClient = await createClient();
    const { data: claims } = await humanClient.auth.getClaims();
    const authentication = await resolveEngagementApiAuthentication({
      authorizationHeader: request.headers.get("authorization"),
      humanUserId:
        typeof claims?.claims?.sub === "string"
          ? claims.claims.sub
          : null,
    });

    if (authentication.status === "unauthenticated") {
      return errorResponse(
        401,
        "unauthorized",
        "Authentication required",
      );
    }
    if (authentication.status === "forbidden") {
      return errorResponse(403, "forbidden", "Access denied");
    }

    const result = await loadAuthorizedEngagements(
      authentication.context,
      {
        loadHumanEngagements: () =>
          loadVisibleEngagements({
            createSupabaseClient: async () => humanClient,
          }),
      },
    );

    if (result.status === "unauthenticated") {
      return errorResponse(
        401,
        "unauthorized",
        "Authentication required",
      );
    }
    if (result.status === "query_failed") {
      return errorResponse(
        500,
        "query_failed",
        "Engagements could not be loaded",
      );
    }

    return Response.json(serializeEngagements(result.engagements), {
      headers: { "content-type": mediaType },
    });
  } catch {
    return errorResponse(
      500,
      "query_failed",
      "Engagements could not be loaded",
    );
  }
}
