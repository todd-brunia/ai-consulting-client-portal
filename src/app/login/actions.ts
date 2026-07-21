"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function authenticate(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const mode = formData.get("mode");

  const result = mode === "signup"
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password });

  if (result.error) redirect(`/login?error=${encodeURIComponent(result.error.message)}`);
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
