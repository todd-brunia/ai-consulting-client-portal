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

export function globToRegExp(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/gu, "\\$&");
  const withGlobstar = escaped.replaceAll("**", "\0");
  const withStars = withGlobstar.replaceAll("*", "[^/]*");
  return new RegExp(`^${withStars.replaceAll("\0", ".*")}$`, "u");
}

export function requiresRelevantCheck(
  changedPaths,
  patterns,
  {
    alwaysRelevantPaths: requiredPaths = new Set(),
    revisionsKnown = true,
    revisionsAvailable = true,
  } = {},
) {
  if (!revisionsKnown || !revisionsAvailable) {
    return true;
  }

  const matchers = patterns.map(globToRegExp);
  return changedPaths.some(
    (path) =>
      requiredPaths.has(path) ||
      matchers.some((matcher) => matcher.test(path)),
  );
}

export function requiresSupabaseIntegration(
  changedPaths,
  patterns = readRelevantPatterns(),
  options = {},
) {
  return requiresRelevantCheck(changedPaths, patterns, {
    ...options,
    alwaysRelevantPaths,
  });
}
