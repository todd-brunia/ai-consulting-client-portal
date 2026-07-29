import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvitationManager } from "./invitation-manager";

const organization = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Example Organization",
};

const invitation = {
  type: "invitations",
  id: "22222222-2222-4222-8222-222222222222",
  attributes: {
    email: "client@example.test",
    role: "client_member",
    status: "pending",
    "organization-name": organization.name,
    "created-at": "2026-07-29T00:00:00Z",
    "expires-at": "2026-08-01T00:00:00Z",
    "consumed-at": null,
    "revoked-at": null,
    "replaced-at": null,
    "invited-by-email": "staff@example.test",
  },
  relationships: {
    organization: {
      data: { type: "organizations", id: organization.id },
    },
    replacement: { data: null },
  },
};

function response(status: number, data: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

describe("InvitationManager", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("provides labeled, keyboard-native controls and normalizes issuance", async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => response(200, { data: [] }))
      .mockImplementationOnce(() =>
        response(201, { data: invitation }),
      )
      .mockImplementationOnce(() =>
        response(200, { data: [invitation] }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<InvitationManager organizations={[organization]} />);

    await screen.findByText("No invitations exist for this organization.");
    expect(
      screen.getByRole("combobox", { name: "Organization" }),
    ).toHaveValue(organization.id);
    const email = screen.getByRole("textbox", { name: "Invitee email" });
    fireEvent.change(email, { target: { value: "  CLIENT@Example.TEST " } });
    fireEvent.click(
      screen.getByRole("button", { name: "Issue invitation" }),
    );

    await screen.findByText("Invitation issued to client@example.test.");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/invitations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          organizationId: organization.id,
          email: "client@example.test",
        }),
      }),
    );
    expect(document.activeElement).toHaveTextContent(
      "Invitation issued to client@example.test.",
    );
  });

  it("announces lifecycle conflicts without exposing server details", async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => response(200, { data: [] }))
      .mockImplementationOnce(() =>
        response(409, {
          errors: [
            {
              code: "invitation_lifecycle_conflict",
              detail: "database detail that must not render",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<InvitationManager organizations={[organization]} />);

    await screen.findByText("No invitations exist for this organization.");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Invitee email" }),
      { target: { value: "client@example.test" } },
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Issue invitation" }).closest(
        "form",
      )!,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "The invitation changed or a live invitation already exists.",
    );
    expect(alert).not.toHaveTextContent("database detail");
    expect(document.activeElement).toBe(alert);
  });

  it("supports inspection and pending lifecycle actions", async () => {
    const inspected = {
      ...invitation,
      attributes: {
        ...invitation.attributes,
        "invited-by-email": "staff@example.test",
      },
    };
    const fetch = vi
      .fn()
      .mockImplementationOnce(() =>
        response(200, { data: [invitation] }),
      )
      .mockImplementationOnce(() => response(200, { data: inspected }))
      .mockImplementationOnce(() =>
        response(201, {
          data: { ...invitation, id: "replacement-id" },
        }),
      )
      .mockImplementationOnce(() =>
        response(200, {
          data: [{ ...invitation, id: "replacement-id" }],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<InvitationManager organizations={[organization]} />);

    await screen.findByText("client@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    await screen.findByRole("heading", { name: "Invitation details" });
    expect(screen.getByText("staff@example.test")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await screen.findByText(
      "A replacement invitation was issued to client@example.test.",
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/v1/invitations/${invitation.id}/replace`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("provides a semantic empty organization state", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<InvitationManager organizations={[]} />);

    expect(
      screen.getByRole("heading", { name: "No organizations available" }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
