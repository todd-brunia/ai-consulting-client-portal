import { createHash } from "node:crypto";
import {
  expect,
  type BrowserContext,
  type Page,
  test,
} from "@playwright/test";
import { createDatabaseAssertions } from "./database-assertions.mjs";

const password = "local-integration-only-password";
const pendingEmail = "pending-client@portal.test";
const wrongAccountEmail = "revoked-client@portal.test";
const invitationCookie = "portal-invitation-token-hash";
let database: ReturnType<typeof createDatabaseAssertions>;

test.use({ trace: "off", video: "off" });

function invitationHash(suffix: string) {
  return createHash("sha256")
    .update(`local-integration-only-invitation-token:${suffix}`)
    .digest("hex");
}

async function stageInvitation(
  context: BrowserContext,
  baseURL: string,
  suffix: string,
) {
  await context.addCookies([
    {
      name: invitationCookie,
      value: invitationHash(suffix),
      url: `${baseURL}/invite`,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function authenticateInvitation(
  page: Page,
  email: string,
  suppliedPassword = password,
) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(suppliedPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function invitationState(suffix: string) {
  const { data: invitation, error: invitationError } = await database.admin
    .from("organization_invitations")
    .select(
      "id, organization_id, consumed_at, consumed_by_application_user_id, revoked_at, replaced_at",
    )
    .eq("token_hash", invitationHash(suffix))
    .single();
  if (invitationError) throw invitationError;

  const { data: user, error: userError } = await database.admin
    .from("application_users")
    .select("id")
    .eq("email", pendingEmail)
    .single();
  if (userError) throw userError;

  const { data: memberships, error: membershipError } = await database.admin
    .from("organization_memberships")
    .select(
      "organization_id, application_user_id, role, status, activated_at, revoked_at",
    )
    .eq("application_user_id", user.id)
    .order("organization_id");
  if (membershipError) throw membershipError;

  return { invitation, memberships };
}

async function protectedState() {
  const [organizations, memberships, invitations] = await Promise.all([
    database.admin.from("organizations").select("id, name").order("id"),
    database.admin
      .from("organization_memberships")
      .select(
        "organization_id, application_user_id, role, status, activated_at, revoked_at",
      )
      .order("organization_id")
      .order("application_user_id"),
    database.admin
      .from("organization_invitations")
      .select(
        "id, organization_id, invited_email, consumed_at, consumed_by_application_user_id, revoked_at, replaced_at, replacement_invitation_id",
      )
      .order("id"),
  ]);
  const error =
    organizations.error ?? memberships.error ?? invitations.error;
  if (error) throw error;
  return {
    organizations: organizations.data,
    memberships: memberships.data,
    invitations: invitations.data,
  };
}

test.describe("client invitation lifecycle journeys", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(() => {
    database = createDatabaseAssertions();
  });
  test.afterAll(async () => {
    await database.cleanup();
  });

  test("requires a complete invitation link without disclosing lifecycle details", async ({
    page,
  }) => {
    await page.goto("/invite");

    await expect(
      page.getByRole("heading", { name: "Invitation link required" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/invite$/);
  });

  test("rejects a malformed invitation link with a generic outcome", async ({
    page,
  }) => {
    await page.goto("/invite?token=too-short");

    await expect(page).toHaveURL(/\/invite\?result=unavailable$/);
    await expect(
      page.getByRole("heading", { name: "Invitation unavailable" }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert", { name: "Invitation unavailable" }),
    ).toContainText("invalid, expired, revoked, replaced, or already used");
  });

  test("shows accessible authentication failure without mutating the invitation", async ({
    page,
    context,
    baseURL,
  }) => {
    const before = await protectedState();
    await stageInvitation(context, baseURL!, "current");
    await page.goto("/invite");
    await authenticateInvitation(page, pendingEmail, "incorrect-password");

    await expect(page).toHaveURL(/\/invite\?result=auth-error$/);
    await expect(
      page.getByRole("alert").filter({
        hasText: "We could not authenticate that account",
      }),
    ).toBeVisible();
    expect(await protectedState()).toEqual(before);
  });

  for (const suffix of [
    "expired",
    "revoked",
    "replaced",
    "consumed",
    "unknown",
  ]) {
    test(`rejects the ${suffix} invitation without mutation or disclosure`, async ({
      page,
      context,
      baseURL,
    }) => {
      const before = await protectedState();
      await stageInvitation(context, baseURL!, suffix);
      await page.goto("/invite");
      await authenticateInvitation(page, pendingEmail);
      await page.getByRole("button", { name: "Accept invitation" }).click();

      await expect(page).toHaveURL(/\/invite\?result=unavailable$/);
      await expect(
        page.getByRole("heading", { name: "Invitation unavailable" }),
      ).toBeVisible();
      expect(await protectedState()).toEqual(before);
    });
  }

  test("rejects the wrong account without changing either organization", async ({
    page,
    context,
    baseURL,
  }) => {
    const before = await protectedState();
    await stageInvitation(context, baseURL!, "current");
    await page.goto("/invite");
    await authenticateInvitation(page, wrongAccountEmail);
    await page.getByRole("button", { name: "Accept invitation" }).click();

    await expect(page).toHaveURL(/\/invite\?result=unavailable$/);
    await expect(
      page.getByRole("heading", { name: "Invitation unavailable" }),
    ).toBeVisible();
    expect(await protectedState()).toEqual(before);
  });

  test("accepts exactly the invited membership and supports idempotent retry", async ({
    page,
    context,
    baseURL,
  }) => {
    const before = await invitationState("current");
    expect(before.memberships).toEqual([
      expect.objectContaining({
        organization_id: before.invitation.organization_id,
        role: "client_member",
        status: "pending",
        activated_at: null,
      }),
    ]);

    await stageInvitation(context, baseURL!, "current");
    await page.goto("/invite");
    await authenticateInvitation(page, pendingEmail);
    await page.getByRole("button", { name: "Accept invitation" }).click();

    await expect(page).toHaveURL(/\/invite\?result=accepted$/);
    await expect(
      page.getByRole("heading", { name: "Invitation accepted" }),
    ).toBeVisible();

    const accepted = await invitationState("current");
    expect(accepted.invitation).toMatchObject({
      id: before.invitation.id,
      organization_id: before.invitation.organization_id,
      revoked_at: null,
      replaced_at: null,
      consumed_at: expect.any(String),
      consumed_by_application_user_id:
        before.memberships[0].application_user_id,
    });
    expect(accepted.memberships).toEqual([
      expect.objectContaining({
        organization_id: before.invitation.organization_id,
        role: "client_member",
        status: "active",
        activated_at: expect.any(String),
        revoked_at: null,
      }),
    ]);

    await stageInvitation(context, baseURL!, "current");
    await page.goto("/invite");
    await page.getByRole("button", { name: "Accept invitation" }).click();

    await expect(page).toHaveURL(/\/invite\?result=already-accepted$/);
    await expect(
      page.getByRole("heading", { name: "Invitation already accepted" }),
    ).toBeVisible();
    expect(await invitationState("current")).toEqual(accepted);
  });
});
