import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isInvitationTokenHash,
  prepareInvitationRedirect,
} from "./invitation-token";

const rawToken = "local-only-opaque-invitation-token-1234567890";

function digest(value: Uint8Array<ArrayBuffer>) {
  return Promise.resolve(
    Uint8Array.from(createHash("sha256").update(value).digest()).buffer,
  );
}

describe("prepareInvitationRedirect", () => {
  it("prepares a clean redirect and returns only the token hash", async () => {
    const pending = prepareInvitationRedirect({
      url: `http://localhost:3000/invite?token=${rawToken}&source=email`,
      digest,
    });

    await expect(pending).resolves.toEqual({
      status: "captured",
      hash: createHash("sha256").update(rawToken).digest("hex"),
      redirectUrl: "http://localhost:3000/invite?source=email",
    });
    expect(JSON.stringify(await pending)).not.toContain(rawToken);
  });

  it("rejects malformed tokens while still preparing a clean redirect", async () => {
    await expect(
      prepareInvitationRedirect({
        url: "http://localhost:3000/invite?token=short",
        digest,
      }),
    ).resolves.toEqual({
      status: "invalid",
      redirectUrl: "http://localhost:3000/invite",
    });
  });

  it("does not alter a URL without a token", async () => {
    await expect(
      prepareInvitationRedirect({
        url: "http://localhost:3000/invite",
        digest,
      }),
    ).resolves.toEqual({ status: "missing" });
  });
});

describe("isInvitationTokenHash", () => {
  it("accepts only lowercase SHA-256 hex", () => {
    expect(isInvitationTokenHash("a".repeat(64))).toBe(true);
    expect(isInvitationTokenHash("A".repeat(64))).toBe(false);
    expect(isInvitationTokenHash("a".repeat(63))).toBe(false);
  });
});
