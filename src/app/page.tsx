import { redirect } from "next/navigation";
import { signOut } from "./login/actions";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) redirect("/login");

  const { data: engagements } = await supabase
    .from("engagements")
    .select("id, name, status, organizations(name)")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="flex items-start justify-between gap-6">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">Client portal lab</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Workspace</h1></div>
        <form action={signOut}><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Sign out</button></form>
      </header>
      <section className="mt-10 grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Engagements</h2>
          <div className="mt-5 space-y-3">
            {engagements?.map((engagement) => (
              <article key={engagement.id} className="rounded-xl bg-slate-50 p-4">
                <p className="font-semibold">{engagement.name}</p>
                <p className="mt-1 text-sm text-slate-600">{engagement.organizations?.[0]?.name} · {engagement.status}</p>
              </article>
            ))}
          </div>
        </div>
        <aside className="rounded-2xl bg-slate-900 p-6 text-white">
          <h2 className="text-lg font-semibold">Architecture trail</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-300"><li>1. Supabase authenticates the user.</li><li>2. Server code resolves tenant membership.</li><li>3. PostgreSQL RLS limits rows.</li><li>4. JSON:API exposes reusable resources.</li></ol>
          <a href="/api/v1/engagements" className="mt-6 inline-block text-sm font-semibold text-teal-300 underline">Inspect JSON:API response</a>
        </aside>
      </section>
    </main>
  );
}
