import {
  authorizationError,
  invitationCollection,
  invitationDocument,
  invitationError,
  lifecycleError,
} from "@/lib/onboarding/invitation-api";
import {
  authorizeStaff,
  deliverLocalInvitation,
  generateInvitationToken,
  isUuid,
  issueInvitation,
  listInvitations,
  normalizeInvitationEmail,
  revokeInvitation,
} from "@/lib/onboarding/staff-invitations";

export async function GET(request: Request) {
  const authorization = await authorizeStaff();
  if (authorization.status !== "authenticated") {
    return authorizationError(authorization.status);
  }

  const organizationId = new URL(request.url).searchParams.get(
    "organizationId",
  );
  if (!isUuid(organizationId)) {
    return invitationError(
      422,
      "invalid_request",
      "Invitation request is invalid",
      "organizationId must be a UUID",
    );
  }

  const result = await listInvitations(
    authorization.client,
    organizationId,
  );
  if (result.status !== "success") {
    return lifecycleError(result.status);
  }
  return invitationCollection(result.invitations);
}

export async function POST(request: Request) {
  const authorization = await authorizeStaff();
  if (authorization.status !== "authenticated") {
    return authorizationError(authorization.status);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return lifecycleError("invalid");
  }

  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const organizationId = input.organizationId;
  const email = normalizeInvitationEmail(input.email);
  if (!isUuid(organizationId) || !email) {
    return invitationError(
      422,
      "invalid_request",
      "Invitation request is invalid",
      "organizationId must be a UUID and email must be valid",
    );
  }

  const token = generateInvitationToken();
  const result = await issueInvitation(
    authorization.client,
    organizationId,
    email,
    token.tokenHash,
  );
  if (result.status !== "success") {
    return lifecycleError(result.status);
  }

  const delivered = await deliverLocalInvitation(
    email,
    token.rawToken,
    new URL(request.url).origin,
  );
  if (!delivered) {
    await revokeInvitation(authorization.client, result.invitation.id);
    return authorizationError("failed");
  }

  return invitationDocument(result.invitation, 201);
}
