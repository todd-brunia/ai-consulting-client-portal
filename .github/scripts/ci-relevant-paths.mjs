import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const alwaysRelevantPaths = new Set([
  ".github/workflows/ci.yml",
  ".github/ci-supabase-paths.txt",
]);

export function readRelevantPatterns(
  path = resolve(process.cwd(), ".github/ci-supabase-paths.txt"),
) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/gu, "\\$&");
  const withGlobstar = escaped.replaceAll("**", "\0");
  const withStars = withGlobstar.replaceAll("*", "[^/]*");
  return new RegExp(`^${withStars.replaceAll("\0", ".*")}$`, "u");
}

export function requiresSupabaseIntegration(
  changedPaths,
  patterns = readRelevantPatterns(),
) {
  const matchers = patterns.map(globToRegExp);
  return changedPaths.some(
    (path) =>
      alwaysRelevantPaths.has(path) ||
      matchers.some((matcher) => matcher.test(path)),
  );
}
