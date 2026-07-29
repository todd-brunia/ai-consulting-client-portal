import { expect, type Page, test } from "@playwright/test";
import { createDatabaseAssertions } from "./database-assertions.mjs";

const password = "local-integration-only-password";
const staffEmail = "staff-admin@portal.test";
const inviteeEmail = "playwright-staff-invite@portal.test";
let database: ReturnType<typeof createDatabaseAssertions>;

test.use({ trace: "off", video: "off" });

async function signInAsStaff(page: Page) {
  await page.goto("/staff/invitations");
  await expect(page).toHaveURL(
    /\/login\?returnTo=\/staff\/invitations$/,
  );
  await page.getByLabel("Email").fill(staffEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff\/invitations$/);
  await expect(
    page.getByRole("heading", { name: "Invitation management" }),
  ).toBeVisible();
}

async function safeInvitationState() {
  const { data, error } = await database.admin
    .from("organization_invitations")
    .select(
      "id, organization_id, invited_email, consumed_at, consumed_by_application_user_id, revoked_at, replaced_at, replacement_invitation_id, created_at, expires_at",
    )
    .order("id");
  if (error) throw error;
  return data;
}

async function invitationsForTestEmail() {
  const { data, error } = await database.admin
    .from("organization_invitations")
    .select(
      "id, organization_id, invited_email, consumed_at, revoked_at, replaced_at, replacement_invitation_id, created_at, expires_at",
    )
    .eq("invited_email", inviteeEmail)
    .order("created_at");
  if (error) throw error;
  return data;
}

async function renderedBodyContainsPersistedHash(
  page: Page,
  invitationId: string,
) {
  const { data, error } = await database.admin
    .from("organization_invitations")
    .select("token_hash")
    .eq("id", invitationId)
    .single();
  if (error) throw error;
  const body = await page.locator("body").textContent();
  return body?.includes(data.token_hash) ?? false;
}

test.describe("staff invitation-management journeys", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    database = createDatabaseAssertions();
    database.registerCleanup(async () => {
      const { error: lineageError } = await database.admin
        .from("organization_invitations")
        .update({
          replaced_at: null,
          replacement_invitation_id: null,
        })
        .eq("invited_email", inviteeEmail);
      if (lineageError) throw lineageError;
      const { error: deleteError } = await database.admin
        .from("organization_invitations")
        .delete()
        .eq("invited_email", inviteeEmail);
      if (deleteError) throw deleteError;
    });
  });

  test.afterAll(async () => {
    await database.cleanup();
  });

  test("preserves staff authentication and exposes labeled responsive controls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsStaff(page);

    const organization = page.getByLabel("Organization");
    const email = page.getByLabel("Invitee email");
    const issue = page.getByRole("button", { name: "Issue invitation" });
    const refresh = page.getByRole("button", { name: "Refresh" });
    await expect(organization).toBeVisible();
    await expect(email).toBeVisible();
    await expect(issue).toBeVisible();
    await expect(refresh).toBeVisible();

    for (const control of [organization, email, issue, refresh]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }

    await refresh.focus();
    await refresh.press("Enter");
    await expect(
      page.getByRole("status").filter({
        hasText: "Select an organization to manage its invitations.",
      }),
    ).toBeVisible();
  });

  test("keeps ordinary clients outside the staff workspace", async ({
    page,
  }) => {
    await page.goto("/staff/invitations");
    await page.getByLabel("Email").fill("tenant-a@portal.test");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByRole("heading", {
        name: "Invitation access unavailable",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({
        hasText: "does not have staff administrator authority",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Issue invitation" }),
    ).toHaveCount(0);
  });

  test("issues, inspects, replaces, and revokes without disclosing secrets", async ({
    page,
  }) => {
    await signInAsStaff(page);
    const organization = page.getByLabel("Organization");
    await organization.selectOption({ label: "Tenant A Test Organization" });
    await expect(
      page.getByText("No invitations exist for this organization."),
    ).toBeVisible();

    const beforeInvalid = await safeInvitationState();
    const email = page.getByLabel("Invitee email");
    await email.fill("malformed");
    await page.getByRole("button", { name: "Issue invitation" }).click();
    await expect(email).toBeFocused();
    expect(await email.evaluate((element: HTMLInputElement) =>
      element.validity.valid
    )).toBe(false);
    expect(await safeInvitationState()).toEqual(beforeInvalid);

    await email.fill(inviteeEmail);
    await page.getByRole("button", { name: "Issue invitation" }).click();
    const issuedStatus = page.getByRole("status").filter({
      hasText: `Invitation issued to ${inviteeEmail}.`,
    });
    await expect(issuedStatus).toBeVisible();
    await expect(issuedStatus).toBeFocused();

    let records = await invitationsForTestEmail();
    expect(records).toHaveLength(1);
    const original = records[0];
    expect(original.organization_id).toBe(await organization.inputValue());
    expect(original.revoked_at).toBeNull();
    expect(original.replaced_at).toBeNull();

    const originalItem = page.getByRole("listitem").filter({
      hasText: inviteeEmail,
    });
    await originalItem.getByRole("button", { name: "Inspect" }).click();
    const inspectedStatus = page.getByRole("status").filter({
      hasText: `Showing invitation details for ${inviteeEmail}.`,
    });
    await expect(inspectedStatus).toBeFocused();
    const details = page.getByRole("heading", {
      name: "Invitation details",
    }).locator("..");
    await expect(details).toContainText(inviteeEmail);
    await expect(details).toContainText(staffEmail);
    await expect(details).toContainText("pending");
    expect(
      await renderedBodyContainsPersistedHash(page, original.id),
    ).toBe(false);
    await expect(page.locator("body")).not.toContainText("sb_secret_");

    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(originalItem).toBeVisible();

    const beforeDuplicate = await safeInvitationState();
    await email.fill(inviteeEmail);
    await page.getByRole("button", { name: "Issue invitation" }).click();
    const duplicateAlert = page.getByRole("alert").filter({
      hasText: "live invitation already exists",
    });
    await expect(duplicateAlert).toBeVisible();
    await expect(duplicateAlert).toBeFocused();
    expect(await safeInvitationState()).toEqual(beforeDuplicate);

    // Local Supabase enforces auth.email.max_frequency = "1s" per address.
    await page.waitForTimeout(1_100);
    await originalItem.getByRole("button", { name: "Replace" }).click();
    const replacedStatus = page.getByRole("status").filter({
      hasText: `A replacement invitation was issued to ${inviteeEmail}.`,
    });
    await expect(replacedStatus).toBeFocused();
    records = await invitationsForTestEmail();
    expect(records).toHaveLength(2);
    const replaced = records.find((record) => record.id === original.id)!;
    const replacement = records.find((record) => record.id !== original.id)!;
    expect(replaced.replaced_at).toEqual(expect.any(String));
    expect(replaced.replacement_invitation_id).toBe(replacement.id);
    expect(replacement.revoked_at).toBeNull();
    expect(replacement.replaced_at).toBeNull();

    const staleBefore = await safeInvitationState();
    const staleResponse = await page.request.post(
      `/api/v1/invitations/${original.id}/revoke`,
      { headers: { accept: "application/vnd.api+json" } },
    );
    expect(staleResponse.status()).toBe(409);
    expect(await safeInvitationState()).toEqual(staleBefore);

    const replacementItem = page.getByRole("listitem").filter({
      hasText: inviteeEmail,
    }).filter({ hasText: "pending" });
    await replacementItem.getByRole("button", { name: "Revoke" }).click();
    const revokedStatus = page.getByRole("status").filter({
      hasText: `The invitation for ${inviteeEmail} was revoked.`,
    });
    await expect(revokedStatus).toBeFocused();
    records = await invitationsForTestEmail();
    expect(
      records.find((record) => record.id === replacement.id)?.revoked_at,
    ).toEqual(expect.any(String));

    const revokedBefore = await safeInvitationState();
    const repeatedResponse = await page.request.post(
      `/api/v1/invitations/${replacement.id}/revoke`,
      { headers: { accept: "application/vnd.api+json" } },
    );
    expect(repeatedResponse.status()).toBe(200);
    expect(await safeInvitationState()).toEqual(revokedBefore);

    await organization.selectOption({ label: "Tenant B Test Organization" });
    await expect(
      page.getByText("No invitations exist for this organization."),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: inviteeEmail }),
    ).toHaveCount(0);
    expect(await safeInvitationState()).toEqual(revokedBefore);
  });
});
