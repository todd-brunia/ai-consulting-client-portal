import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import {
  invitationHashCookie,
  prepareInvitationRedirect,
} from "@/lib/onboarding/invitation-token";

export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/invite" &&
    request.nextUrl.searchParams.has("token")
  ) {
    const prepared = await prepareInvitationRedirect({
      url: request.nextUrl.toString(),
      digest: (value) => crypto.subtle.digest("SHA-256", value),
    });
    const redirectUrl = new URL(prepared.redirectUrl ?? "/invite", request.url);
    if (prepared.status === "invalid") {
      redirectUrl.searchParams.set("result", "unavailable");
    }

    const response = NextResponse.redirect(redirectUrl);
    if (prepared.status === "captured") {
      response.cookies.set(invitationHashCookie, prepared.hash, {
        httpOnly: true,
        maxAge: 30 * 60,
        path: "/invite",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return response;
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
