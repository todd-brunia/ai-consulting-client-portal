import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import {
  invitationHashCookie,
  isInvitationTokenHash,
} from "@/lib/onboarding/invitation-token";
import { InvitationFlow } from "./invitation-flow";

const results = [
  "accepted",
  "already-accepted",
  "auth-error",
  "unavailable",
] as const;

type InvitationResult = (typeof results)[number];

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { result: requestedResult } = await searchParams;
  const result = results.includes(requestedResult as InvitationResult)
    ? (requestedResult as InvitationResult)
    : undefined;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const cookieStore = await cookies();
  const invitationReady = isInvitationTokenHash(
    cookieStore.get(invitationHashCookie)?.value ?? "",
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
        Client portal
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Accept your invitation
      </h1>
      <p className="mt-4 text-slate-600">
        Securely connect your local account to the organization that invited you.
      </p>
      <InvitationFlow
        authenticated={Boolean(data?.claims?.sub)}
        invitationReady={invitationReady}
        result={result}
      />
      <p className="mt-6 text-xs leading-5 text-slate-500">
        Local activation does not represent hosted delivery, production
        verification, phone verification, terms acceptance, or SMS consent.
      </p>
    </main>
  );
}
