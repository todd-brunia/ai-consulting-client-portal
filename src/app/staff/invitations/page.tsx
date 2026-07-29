import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { authorizeStaff } from "@/lib/onboarding/staff-invitations";
import { InvitationManager } from "./invitation-manager";

export default async function StaffInvitationsPage() {
  const authorization = await authorizeStaff();
  if (authorization.status === "unauthenticated") {
    redirect("/login?returnTo=/staff/invitations");
  }

  if (authorization.status !== "authenticated") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
          Staff workspace
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Invitation access unavailable
        </h1>
        <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-amber-950">
          {authorization.status === "forbidden"
            ? "Your authenticated account does not have staff administrator authority."
            : "The invitation service is temporarily unavailable."}
        </p>
        <form action={signOut} className="mt-6">
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
            Sign out
          </button>
        </form>
      </main>
    );
  }

  const { data, error } = await authorization.client
    .from("organizations")
    .select("id, name")
    .order("name");
  const organizations = error ? [] : (data ?? []);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            Staff workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Invitation management
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Issue and manage local client invitations for an existing organization.
          </p>
        </div>
        <form action={signOut}>
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
            Sign out
          </button>
        </form>
      </header>

      <InvitationManager organizations={organizations} />

      <p className="mt-10 border-t border-slate-200 pt-6 text-xs leading-5 text-slate-500">
        This local workflow does not represent production delivery, verification,
        consent, terms acceptance, or hosted onboarding readiness.
      </p>
    </main>
  );
}
