import { authenticate } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">Client portal lab</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Explore the local workspace</h1>
      <p className="mt-4 text-slate-600">Create a local account, then inspect the organization and engagement created for it.</p>
      {error ? <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <form action={authenticate} className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="returnTo" value={returnTo ?? ""} />
        <label className="block text-sm font-medium">Email<input name="email" type="email" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="block text-sm font-medium">Password<input name="password" type="password" minLength={6} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <div className="flex gap-3">
          <button name="mode" value="login" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Sign in</button>
          <button name="mode" value="signup" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Create local account</button>
        </div>
      </form>
    </main>
  );
}
