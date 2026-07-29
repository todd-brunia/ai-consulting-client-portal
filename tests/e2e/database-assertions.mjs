import { createClient } from "@supabase/supabase-js";
import { readDisposableSupabaseStatus } from "../../scripts/playwright-local-environment.mjs";
import { createCleanupStack } from "../../scripts/playwright-database-cleanup.mjs";

export function createDatabaseAssertions() {
  const status = readDisposableSupabaseStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const cleanup = createCleanupStack();

  return {
    admin,
    registerCleanup(task) {
      cleanup.register(task);
    },
    async rows(table, configure = (query) => query) {
      const { data, error } = await configure(admin.from(table).select("*"));
      if (error) throw new Error(`Could not inspect ${table}: ${error.message}`);
      return data;
    },
    async cleanup() {
      await cleanup.run();
    },
  };
}

export function rowIds(rows) {
  return rows.map(({ id }) => id).sort();
}
