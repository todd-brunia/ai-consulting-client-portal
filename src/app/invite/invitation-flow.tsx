"use client";

import Link from "next/link";
import {
  acceptInvitation,
  invitationAuthenticate,
} from "./actions";

type Result =
  | "accepted"
  | "already-accepted"
  | "auth-error"
  | "unavailable"
  | undefined;

export function InvitationFlow({
  authenticated,
  invitationReady,
  result,
}: {
  authenticated: boolean;
  invitationReady: boolean;
  result: Result;
}) {
  if (result === "accepted" || result === "already-accepted") {
    return (
      <section
        aria-labelledby="invitation-success"
        className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6"
      >
        <h2 id="invitation-success" className="text-xl font-semibold text-emerald-950">
          {result === "accepted" ? "Invitation accepted" : "Invitation already accepted"}
        </h2>
        <p className="mt-2 text-sm text-emerald-900">
          Your client membership is active. Continue to your organization workspace.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Open workspace
        </Link>
      </section>
    );
  }

  if (result === "unavailable") {
    return (
      <section
        role="alert"
        aria-labelledby="invitation-unavailable"
        className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6"
      >
        <h2 id="invitation-unavailable" className="text-xl font-semibold text-amber-950">
          Invitation unavailable
        </h2>
        <p className="mt-2 text-sm text-amber-900">
          This link may be invalid, expired, revoked, replaced, or already used by
          another account. Ask your consulting contact for a new invitation.
        </p>
      </section>
    );
  }

  if (!invitationReady) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Invitation link required</h2>
        <p className="mt-2 text-sm text-slate-600">
          Open the complete link from your invitation. If it no longer works,
          ask your consulting contact for a replacement.
        </p>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <form
        action={invitationAuthenticate}
        className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <fieldset>
          <legend className="text-xl font-semibold">Authenticate your account</legend>
          <p className="mt-2 text-sm text-slate-600">
            Use the email address that received this invitation. Authentication
            alone does not grant organization access.
          </p>
          {result === "auth-error" ? (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              We could not authenticate that account. Check the details or create
              the invited local account.
            </p>
          ) : null}
          <label className="mt-5 block text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={6}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button
            name="mode"
            value="login"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Sign in
          </button>
          <button
            name="mode"
            value="signup"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            Create local account
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      action={acceptInvitation}
      className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-xl font-semibold">Activate client access</h2>
      <p className="mt-2 text-sm text-slate-600">
        Your account is authenticated. Accept this invitation to activate only
        the organization membership associated with it.
      </p>
      <button className="mt-5 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white">
        Accept invitation
      </button>
    </form>
  );
}
