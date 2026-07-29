"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Organization = { id: string; name: string };

type InvitationResource = {
  type: "invitations";
  id: string;
  attributes: {
    email: string;
    role: "client_member";
    status: "pending" | "expired" | "revoked" | "consumed" | "replaced";
    "organization-name": string;
    "created-at": string;
    "expires-at": string;
    "consumed-at": string | null;
    "revoked-at": string | null;
    "replaced-at": string | null;
    "invited-by-email": string;
  };
  relationships: {
    organization: { data: { type: "organizations"; id: string } };
    replacement: {
      data: { type: "invitations"; id: string } | null;
    };
  };
};

type Feedback = {
  kind: "success" | "error";
  message: string;
} | null;

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";

function messageForResponse(status: number): string {
  if (status === 401) return "Your session has ended. Sign in and try again.";
  if (status === 403) {
    return "Your account does not have staff administrator authority.";
  }
  if (status === 404) {
    return "That invitation or organization is no longer available.";
  }
  if (status === 409) {
    return "The invitation changed or a live invitation already exists. Refresh and try again.";
  }
  if (status === 422) {
    return "Check the organization and email address, then try again.";
  }
  return "The invitation service could not complete that request.";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function InvitationManager({
  organizations,
}: {
  organizations: Organization[];
}) {
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id ?? "",
  );
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState<InvitationResource[]>([]);
  const [inspected, setInspected] = useState<InvitationResource | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const announce = useCallback((next: Feedback) => {
    setFeedback(next);
    window.setTimeout(() => feedbackRef.current?.focus(), 0);
  }, []);

  const loadInvitations = useCallback(async () => {
    if (!organizationId) {
      setInvitations([]);
      return;
    }
    setBusyAction("load");
    try {
      const response = await fetch(
        `/api/v1/invitations?organizationId=${encodeURIComponent(organizationId)}`,
        { headers: { accept: "application/vnd.api+json" } },
      );
      if (!response.ok) {
        announce({ kind: "error", message: messageForResponse(response.status) });
        return;
      }
      const document = (await response.json()) as {
        data: InvitationResource[];
      };
      setInvitations(document.data);
      setInspected(null);
    } catch {
      announce({
        kind: "error",
        message: "The invitation service could not be reached.",
      });
    } finally {
      setBusyAction(null);
    }
  }, [announce, organizationId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadInvitations();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadInvitations]);

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!organizationId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      announce({
        kind: "error",
        message: "Choose an organization and enter a valid email address.",
      });
      return;
    }

    setBusyAction("issue");
    try {
      const response = await fetch("/api/v1/invitations", {
        method: "POST",
        headers: {
          accept: "application/vnd.api+json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
          email: normalizedEmail,
        }),
      });
      if (!response.ok) {
        announce({ kind: "error", message: messageForResponse(response.status) });
        return;
      }
      setEmail("");
      announce({
        kind: "success",
        message: `Invitation issued to ${normalizedEmail}.`,
      });
      await loadInvitations();
    } catch {
      announce({
        kind: "error",
        message: "The invitation service could not be reached.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function inspect(invitationId: string) {
    setBusyAction(`inspect:${invitationId}`);
    try {
      const response = await fetch(`/api/v1/invitations/${invitationId}`, {
        headers: { accept: "application/vnd.api+json" },
      });
      if (!response.ok) {
        announce({ kind: "error", message: messageForResponse(response.status) });
        return;
      }
      const document = (await response.json()) as {
        data: InvitationResource;
      };
      setInspected(document.data);
      announce({
        kind: "success",
        message: `Showing invitation details for ${document.data.attributes.email}.`,
      });
    } catch {
      announce({
        kind: "error",
        message: "The invitation service could not be reached.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function mutate(
    invitation: InvitationResource,
    action: "replace" | "revoke",
  ) {
    setBusyAction(`${action}:${invitation.id}`);
    try {
      const response = await fetch(
        `/api/v1/invitations/${invitation.id}/${action}`,
        {
          method: "POST",
          headers: { accept: "application/vnd.api+json" },
        },
      );
      if (!response.ok) {
        announce({ kind: "error", message: messageForResponse(response.status) });
        return;
      }
      announce({
        kind: "success",
        message:
          action === "replace"
            ? `A replacement invitation was issued to ${invitation.attributes.email}.`
            : `The invitation for ${invitation.attributes.email} was revoked.`,
      });
      await loadInvitations();
    } catch {
      announce({
        kind: "error",
        message: "The invitation service could not be reached.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  if (organizations.length === 0) {
    return (
      <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-xl font-semibold text-amber-950">
          No organizations available
        </h2>
        <p className="mt-2 text-sm text-amber-900">
          Create or provision an organization outside this workflow before
          issuing an invitation.
        </p>
      </section>
    );
  }

  return (
    <>
      <div
        ref={feedbackRef}
        tabIndex={-1}
        role={feedback?.kind === "error" ? "alert" : "status"}
        aria-live={feedback?.kind === "error" ? "assertive" : "polite"}
        className={`mt-6 min-h-12 rounded-xl p-4 text-sm outline-none ${
          feedback?.kind === "error"
            ? "bg-red-50 text-red-900"
            : feedback?.kind === "success"
              ? "bg-emerald-50 text-emerald-900"
              : "bg-slate-100 text-slate-600"
        }`}
      >
        {feedback?.message ?? "Select an organization to manage its invitations."}
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <form
          onSubmit={issue}
          className="h-fit space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div>
            <h2 className="text-xl font-semibold">Issue invitation</h2>
            <p className="mt-2 text-sm text-slate-600">
              A local Supabase email link will be sent. Tokens are never shown here.
            </p>
          </div>
          <label className="block text-sm font-medium" htmlFor="organization">
            Organization
          </label>
          <select
            id="organization"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            className={`-mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 ${focusRing}`}
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <label className="block text-sm font-medium" htmlFor="invite-email">
            Invitee email
          </label>
          <input
            id="invite-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className={`-mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 ${focusRing}`}
          />
          <button
            type="submit"
            disabled={busyAction !== null}
            className={`w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
          >
            {busyAction === "issue" ? "Issuing…" : "Issue invitation"}
          </button>
        </form>

        <section aria-labelledby="invitation-list-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="invitation-list-heading" className="text-xl font-semibold">
                Invitation lifecycle
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Inspect current state or explicitly replace and revoke pending links.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadInvitations()}
              disabled={busyAction !== null}
              className={`rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60 ${focusRing}`}
            >
              Refresh
            </button>
          </div>

          {invitations.length === 0 && busyAction !== "load" ? (
            <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">
              No invitations exist for this organization.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {invitations.map((invitation) => {
                const pending = invitation.attributes.status === "pending";
                return (
                  <li
                    key={invitation.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-semibold">
                          {invitation.attributes.email}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Expires {formatDate(invitation.attributes["expires-at"])}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">
                        {invitation.attributes.status}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void inspect(invitation.id)}
                        disabled={busyAction !== null}
                        className={`rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-60 ${focusRing}`}
                      >
                        Inspect
                      </button>
                      {pending ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void mutate(invitation, "replace")}
                            disabled={busyAction !== null}
                            className={`rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60 ${focusRing}`}
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => void mutate(invitation, "revoke")}
                            disabled={busyAction !== null}
                            className={`rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-60 ${focusRing}`}
                          >
                            Revoke
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>

      {inspected ? (
        <section
          aria-labelledby="inspection-heading"
          className="mt-6 rounded-2xl bg-slate-900 p-5 text-white sm:p-6"
        >
          <h2 id="inspection-heading" className="text-xl font-semibold">
            Invitation details
          </h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-slate-400">Email</dt>
              <dd className="mt-1 break-words">{inspected.attributes.email}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Status</dt>
              <dd className="mt-1 capitalize">{inspected.attributes.status}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Issued by</dt>
              <dd className="mt-1 break-words">
                {inspected.attributes["invited-by-email"]}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Created</dt>
              <dd className="mt-1">
                {formatDate(inspected.attributes["created-at"])}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Expires</dt>
              <dd className="mt-1">
                {formatDate(inspected.attributes["expires-at"])}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Replacement</dt>
              <dd className="mt-1 break-all">
                {inspected.relationships.replacement.data?.id ?? "—"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </>
  );
}
