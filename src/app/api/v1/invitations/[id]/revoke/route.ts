import {
  authorizationError,
  invitationDocument,
  lifecycleError,
} from "@/lib/onboarding/invitation-api";
import {
  authorizeStaff,
  isUuid,
  revokeInvitation,
} from "@/lib/onboarding/staff-invitations";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeStaff();
  if (authorization.status !== "authenticated") {
    return authorizationError(authorization.status);
  }

  const { id } = await context.params;
  if (!isUuid(id)) return lifecycleError("not_found");
  const result = await revokeInvitation(authorization.client, id);
  if (result.status !== "success") {
    return lifecycleError(result.status);
  }
  return invitationDocument(result.invitation);
}
