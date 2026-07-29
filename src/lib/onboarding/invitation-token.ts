const tokenHashPattern = /^[a-f0-9]{64}$/;

export type InvitationCaptureResult =
  | { status: "captured"; hash: string }
  | { status: "missing" }
  | { status: "invalid" };

export const invitationHashCookie = "portal-invitation-token-hash";

export function isInvitationTokenHash(value: string): boolean {
  return tokenHashPattern.test(value);
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function prepareInvitationRedirect({
  url,
  digest,
}: {
  url: string;
  digest: (value: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>;
}): Promise<
  InvitationCaptureResult & { redirectUrl?: string }
> {
  const parsedUrl = new URL(url);
  const rawToken = parsedUrl.searchParams.get("token");

  if (!rawToken) return { status: "missing" };

  parsedUrl.searchParams.delete("token");
  const redirectUrl = parsedUrl.toString();

  if (rawToken.length < 32 || rawToken.length > 512) {
    return { status: "invalid", redirectUrl };
  }

  const hash = bytesToHex(
    await digest(new TextEncoder().encode(rawToken)),
  );
  return isInvitationTokenHash(hash)
    ? { status: "captured", hash, redirectUrl }
    : { status: "invalid", redirectUrl };
}
