import type { SafeInvitation } from "./staff-invitations";

export const jsonApiMediaType = "application/vnd.api+json";

export function invitationError(
  status: number,
  code: string,
  title: string,
  detail?: string,
) {
  return Response.json(
    {
      errors: [
        {
          status: String(status),
          code,
          title,
          ...(detail ? { detail } : {}),
        },
      ],
    },
    {
      status,
      headers: { "content-type": jsonApiMediaType },
    },
  );
}

export function serializeInvitation(invitation: SafeInvitation) {
  return {
    type: "invitations",
    id: invitation.id,
    attributes: {
      email: invitation.invited_email,
      role: invitation.role,
      status: invitation.status,
      "organization-name": invitation.organization_name,
      "created-at": invitation.created_at,
      "expires-at": invitation.expires_at,
      "consumed-at": invitation.consumed_at,
      "revoked-at": invitation.revoked_at,
      "replaced-at": invitation.replaced_at,
      "invited-by-email": invitation.invited_by_email,
    },
    relationships: {
      organization: {
        data: {
          type: "organizations",
          id: invitation.organization_id,
        },
      },
      "invited-by": {
        data: {
          type: "application-users",
          id: invitation.invited_by_application_user_id,
        },
      },
      replacement: {
        data: invitation.replacement_invitation_id
          ? {
              type: "invitations",
              id: invitation.replacement_invitation_id,
            }
          : null,
      },
    },
  };
}

export function invitationDocument(
  invitation: SafeInvitation,
  status = 200,
) {
  return Response.json(
    {
      jsonapi: { version: "1.1" },
      data: serializeInvitation(invitation),
    },
    {
      status,
      headers: { "content-type": jsonApiMediaType },
    },
  );
}

export function invitationCollection(invitations: SafeInvitation[]) {
  return Response.json(
    {
      jsonapi: { version: "1.1" },
      data: invitations.map(serializeInvitation),
    },
    { headers: { "content-type": jsonApiMediaType } },
  );
}

export function authorizationError(
  status: "unauthenticated" | "forbidden" | "failed",
) {
  if (status === "unauthenticated") {
    return invitationError(401, "unauthorized", "Authentication required");
  }
  if (status === "forbidden") {
    return invitationError(403, "forbidden", "Access denied");
  }
  return invitationError(
    503,
    "service_unavailable",
    "Invitation service unavailable",
  );
}

export function lifecycleError(status: string) {
  if (status === "forbidden") return authorizationError("forbidden");
  if (status === "not_found") {
    return invitationError(404, "not_found", "Invitation resource not found");
  }
  if (status === "invalid") {
    return invitationError(
      422,
      "invalid_request",
      "Invitation request is invalid",
    );
  }
  if (status === "conflict") {
    return invitationError(
      409,
      "invitation_lifecycle_conflict",
      "Invitation lifecycle conflict",
    );
  }
  return authorizationError("failed");
}
