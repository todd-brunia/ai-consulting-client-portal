import { createClient } from "@/lib/supabase/server";
import { serializeEngagements } from "@/lib/json-api";

const mediaType = "application/vnd.api+json";

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) {
    return Response.json({ errors: [{ status: "401", code: "unauthorized", title: "Authentication required" }] }, { status: 401, headers: { "content-type": mediaType } });
  }

  const { data, error } = await supabase
    .from("engagements")
    .select("id, organization_id, name, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ errors: [{ status: "500", code: "query_failed", title: "Engagements could not be loaded" }] }, { status: 500, headers: { "content-type": mediaType } });
  }

  return Response.json(serializeEngagements(data), {
    headers: { "content-type": mediaType },
  });
}
