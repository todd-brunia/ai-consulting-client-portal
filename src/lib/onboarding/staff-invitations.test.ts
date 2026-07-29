import { describe, expect, it, vi } from "vitest";
import {
  authorizeStaff,
  generateInvitationToken,
  isUuid,
  issueInvitation,
  normalizeInvitationEmail,
} from "./staff-invitations";

describe("staff invitation input", () => {
  it("normalizes valid email without accepting malformed input", () => {
    expect(normalizeInvitationEmail("  Client@Example.TEST ")).toBe(
      "client@example.test",
    );
    expect(normalizeInvitationEmail("not-an-email")).toBeNull();
    expect(normalizeInvitationEmail(null)).toBeNull();
  });

  it("validates UUID resource identifiers", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("organization-1")).toBe(false);
  });

  it("generates opaque tokens while exposing only a SHA-256 hash separately", () => {
    const first = generateInvitationToken();
    const second = generateInvitationToken();

    expect(first.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).not.toContain(first.rawToken);
    expect(second.rawToken).not.toBe(first.rawToken);
  });
});

describe("staff authorization", () => {
  it("requires an authenticated identity before checking authority", async () => {
    const rpc = vi.fn();
    const client = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }),
      },
      rpc,
    };

    await expect(
      authorizeStaff(async () => client as never),
    ).resolves.toEqual({ status: "unauthenticated" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not infer staff authority from authentication", async () => {
    const client = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "user-1" } },
        }),
      },
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };

    await expect(
      authorizeStaff(async () => client as never),
    ).resolves.toEqual({ status: "forbidden" });
  });
});

describe("lifecycle RPC mapping", () => {
  it("maps duplicate issuance to a stable conflict", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: { outcome: "conflict" },
        error: null,
      }),
    };

    await expect(
      issueInvitation(
        client as never,
        "11111111-1111-4111-8111-111111111111",
        "client@example.test",
        "a".repeat(64),
      ),
    ).resolves.toEqual({ status: "conflict" });
  });
});
