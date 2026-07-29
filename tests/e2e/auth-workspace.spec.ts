import { expect, type Page, test } from "@playwright/test";

const password = "local-integration-only-password";

async function signIn(
  page: Page,
  email = "tenant-a@portal.test",
  suppliedPassword = password,
) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(suppliedPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("authentication and workspace journeys", () => {
  test.describe.configure({ mode: "serial" });

  test("redirects an unauthenticated workspace request to login", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Explore the local workspace" }),
    ).toBeVisible();
  });

  test("shows an accessible invalid-login outcome", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, "tenant-a@portal.test", "incorrect-password");

    await expect(page).toHaveURL(/\/login\?error=/);
    await expect(page.getByText("Invalid login credentials")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Explore the local workspace" }),
    ).toBeVisible();
  });

  test("preserves a safe invitation destination after login", async ({
    page,
  }) => {
    await page.goto("/login?returnTo=/invite");
    await signIn(page);

    await expect(page).toHaveURL(/\/invite$/);
    await expect(
      page.getByRole("heading", { name: "Accept your invitation" }),
    ).toBeVisible();
  });

  for (const returnTo of [
    "https://example.com/collect-session",
    "//example.com/collect-session",
  ]) {
    test(`rejects unsafe return destination ${returnTo}`, async ({ page }) => {
      await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      await signIn(page);

      await expect(page).toHaveURL("/");
      await expect(
        page.getByRole("heading", { name: "Workspace" }),
      ).toBeVisible();
    });
  }

  test("shows only the authenticated tenant's engagement", async ({
    page,
  }) => {
    await page.goto("/login");
    await signIn(page);

    await expect(
      page.getByRole("heading", { name: "Workspace" }),
    ).toBeVisible();
    await expect(
      page.getByText("Tenant A Integration Engagement"),
    ).toBeVisible();
    await expect(
      page.getByText("Tenant B Integration Engagement"),
    ).toHaveCount(0);
    await expect(page.getByText("Tenant B Test Organization")).toHaveCount(0);
  });

  test("preserves the staff destination and shows generic forbidden access", async ({
    page,
  }) => {
    await page.goto("/staff/invitations");
    await expect(page).toHaveURL(
      /\/login\?returnTo=\/staff\/invitations$/,
    );

    await signIn(page);

    await expect(page).toHaveURL(/\/staff\/invitations$/);
    await expect(
      page.getByRole("heading", {
        name: "Invitation access unavailable",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({
        hasText:
          "Your authenticated account does not have staff administrator authority.",
      }),
    ).toBeVisible();
    await expect(page.getByText("Tenant B Test Organization")).toHaveCount(0);
  });

  test("signs out and clears the authenticated workspace session", async ({
    page,
  }) => {
    await page.goto("/login");
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "Workspace" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});
