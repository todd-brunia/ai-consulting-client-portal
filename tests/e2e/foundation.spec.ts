import { expect, test } from "@playwright/test";
import { createDatabaseAssertions, rowIds } from "./database-assertions.mjs";

test.describe.configure({ mode: "serial" });

test("uses isolated authentication state for a production-served browser smoke check", async ({
  page,
  context,
}) => {
  expect(await context.storageState()).toEqual({ cookies: [], origins: [] });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill("tenant-a@portal.test");
  await page.getByLabel("Password").fill("local-integration-only-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();
  await expect(page.getByText("Tenant A Integration Engagement")).toBeVisible();
});

test("verifies mutation, retention, deletion, idempotency, and cleanup", async () => {
  const database = createDatabaseAssertions();
  const marker = `Playwright disposable ${crypto.randomUUID()}`;
  let createdId: string | undefined;

  try {
    const engagementsBefore = await database.rows("engagements");
    const { data: created, error: createError } = await database.admin
      .from("organizations")
      .insert({ name: marker })
      .select("id, name")
      .single();
    if (createError) throw createError;
    createdId = created.id;
    database.registerCleanup(async () => {
      const { error } = await database.admin
        .from("organizations")
        .delete()
        .eq("id", created.id);
      if (error) throw error;
    });

    const afterMutation = await database.rows(
      "organizations",
      (query) => query.eq("id", created.id),
    );
    expect(afterMutation).toEqual([
      expect.objectContaining({ id: created.id, name: marker }),
    ]);

    const { error: idempotentError } = await database.admin
      .from("organizations")
      .upsert({ id: created.id, name: marker });
    if (idempotentError) throw idempotentError;
    expect(
      await database.rows("organizations", (query) =>
        query.eq("id", created.id),
      ),
    ).toEqual(afterMutation);

    expect(rowIds(await database.rows("engagements"))).toEqual(
      rowIds(engagementsBefore),
    );

    const { error: deleteError } = await database.admin
      .from("organizations")
      .delete()
      .eq("id", created.id);
    if (deleteError) throw deleteError;
    createdId = undefined;
    expect(
      await database.rows("organizations", (query) =>
        query.eq("id", created.id),
      ),
    ).toEqual([]);
  } finally {
    await database.cleanup();
  }

  expect(createdId).toBeUndefined();
});
