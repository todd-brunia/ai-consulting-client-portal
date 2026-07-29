import { describe, expect, it } from "vitest";
import {
  invitationDocument,
  invitationError,
} from "./invitation-api";
import type { SafeInvitation } from "./staff-invitations";

const invitation: SafeInvitation = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  organization_name: "Example",
  invited_email: "client@example.test",
  role: "client_member",
  status: "pending",
  created_at: "2026-07-29T00:00:00Z",
  expires_at: "2026-08-01T00:00:00Z",
  consumed_at: null,
  revoked_at: null,
  replaced_at: null,
  replacement_invitation_id: null,
  invited_by_application_user_id:
    "33333333-3333-4333-8333-333333333333",
  invited_by_email: "staff@example.test",
};

describe("invitation JSON:API documents", () => {
  it("serializes only the approved inspection fields", async () => {
    const response = invitationDocument(invitation, 201);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.api+json",
    );
    expect(serialized).toContain("client@example.test");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("secret");
  });

  it("uses stable non-disclosing lifecycle errors", async () => {
    const response = invitationError(
      409,
      "invitation_lifecycle_conflict",
      "Invitation lifecycle conflict",
    );
    await expect(response.json()).resolves.toEqual({
      errors: [
        {
          status: "409",
          code: "invitation_lifecycle_conflict",
          title: "Invitation lifecycle conflict",
        },
      ],
    });
  });
});
