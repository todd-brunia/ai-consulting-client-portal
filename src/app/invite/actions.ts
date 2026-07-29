"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  invitationHashCookie,
  isInvitationTokenHash,
} from "@/lib/onboarding/invitation-token";

export async function invitationAuthenticate(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const mode = formData.get("mode");

  const result =
    mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

  if (result.error) redirect("/invite?result=auth-error");
  redirect("/invite");
}

export async function acceptInvitation() {
  const cookieStore = await cookies();
  const tokenHash = cookieStore.get(invitationHashCookie)?.value ?? "";
  if (!isInvitationTokenHash(tokenHash)) {
    redirect("/invite?result=unavailable");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "accept_organization_invitation",
    { invitation_token_hash: tokenHash },
  );

  if (error || (data !== "accepted" && data !== "already_accepted")) {
    redirect("/invite?result=unavailable");
  }

  cookieStore.delete(invitationHashCookie);
  redirect(
    data === "already_accepted"
      ? "/invite?result=already-accepted"
      : "/invite?result=accepted",
  );
}
