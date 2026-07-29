import {
  authorizationError,
  invitationDocument,
  lifecycleError,
} from "@/lib/onboarding/invitation-api";
import {
  authorizeStaff,
  deliverLocalInvitation,
  generateInvitationToken,
  isUuid,
  replaceInvitation,
  revokeInvitation,
} from "@/lib/onboarding/staff-invitations";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeStaff();
  if (authorization.status !== "authenticated") {
    return authorizationError(authorization.status);
  }

  const { id } = await context.params;
  if (!isUuid(id)) return lifecycleError("not_found");
  const token = generateInvitationToken();
  const result = await replaceInvitation(
    authorization.client,
    id,
    token.tokenHash,
  );
  if (result.status !== "success") {
    return lifecycleError(result.status);
  }

  const delivered = await deliverLocalInvitation(
    result.invitation.invited_email,
    token.rawToken,
    new URL(request.url).origin,
  );
  if (!delivered) {
    await revokeInvitation(authorization.client, result.invitation.id);
    return authorizationError("failed");
  }
  return invitationDocument(result.invitation, 201);
}
