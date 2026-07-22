import { createHash } from "node:crypto";

export const PLAN_MARKER = "<!-- codex-implementation-plan -->";
export const AUTOMATION_MARKER_PREFIX = "<!-- codex-automation:";
export const SPLIT_PROPOSAL_PREFIX = "<!-- codex-split-proposal:";
export const SPLIT_CHILD_PREFIX = "<!-- codex-split-child:";
export const SPLIT_CHECKLIST_PREFIX = "<!-- codex-split-checklist:";
export const STATE_LABELS = [
  "needs-planning",
  "plan-ready",
  "changes-requested",
  "approved-for-build",
  "approved-for-ai-build",
  "in-progress",
  "preview-ready",
  "blocked",
  "needs-decision",
  "split-proposed",
  "approved-for-split",
  "split-parent",
];

export const STAGES = {
  "needs-planning": "plan",
  "changes-requested": "revise",
  "approved-for-ai-build": "implement",
  "approved-for-split": "split",
};

export const PLANNING_CLASSIFICATIONS = new Set([
  "focused",
  "needs-decision",
  "split-required",
]);

const SUPPORTED_RESPONSE_SCHEMA_KEYWORDS = new Set([
  "$schema",
  "additionalProperties",
  "enum",
  "items",
  "properties",
  "required",
  "type",
]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateResponseSchemaCompatibility(schema, path = "$") {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error(`Response schema at ${path} must be an object.`);
  }
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_RESPONSE_SCHEMA_KEYWORDS.has(key)) {
      throw new Error(`Unsupported response schema keyword at ${path}: ${key}`);
    }
  }
  if (schema.properties) {
    const propertyNames = Object.keys(schema.properties);
    const required = new Set(schema.required ?? []);
    const missing = propertyNames.filter((name) => !required.has(name));
    if (missing.length > 0) {
      throw new Error(`Every property at ${path} must be required: ${missing.join(", ")}`);
    }
    if (schema.additionalProperties !== false) {
      throw new Error(`Object schema at ${path} must set additionalProperties to false.`);
    }
    for (const [name, propertySchema] of Object.entries(schema.properties)) {
      validateResponseSchemaCompatibility(propertySchema, `${path}.properties.${name}`);
    }
  }
  if (schema.items) validateResponseSchemaCompatibility(schema.items, `${path}.items`);
  return schema;
}

export function fingerprint(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function marker(stage, issueNumber, digest) {
  return `${AUTOMATION_MARKER_PREFIX}${stage}:issue-${issueNumber}:${digest} -->`;
}

function assertText(value, name, { min = 1, max = 2000 } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw new Error(`${name} must be ${min}-${max} characters.`);
  }
  validatePublicText(value);
  if (value.includes("<!-- codex-")) {
    throw new Error(`${name} contains a reserved automation marker.`);
  }
  return value;
}

function assertTextList(value, name, { min = 1, max = 12, itemMin = 1, itemMax = 500 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${name} must contain ${min}-${max} items.`);
  }
  return value.map((item, index) => assertText(item, `${name}[${index}]`, { min: itemMin, max: itemMax }));
}

export function validatePlanningResult(result) {
  if (!result || typeof result !== "object" || !PLANNING_CLASSIFICATIONS.has(result.classification)) {
    throw new Error("Planning result has an invalid classification.");
  }
  assertText(result.markdown, "markdown", { min: 40, max: 12_000 });

  if (result.classification === "focused") {
    if (result.blockingDecision !== null || result.splitReason !== null || result.children !== null) {
      throw new Error("Focused planning fields must be null.");
    }
    return result;
  }
  if (result.classification === "needs-decision") {
    assertText(result.blockingDecision, "blockingDecision", { min: 10 });
    if (result.splitReason !== null || result.children !== null) {
      throw new Error("Needs-decision split fields must be null.");
    }
    return result;
  }

  if (result.blockingDecision !== null) {
    throw new Error("Split-required blockingDecision must be null.");
  }
  assertText(result.splitReason, "splitReason", { min: 10 });
  if (!Array.isArray(result.children) || result.children.length < 2 || result.children.length > 10) {
    throw new Error("A split proposal must contain 2-10 children.");
  }
  const ids = new Set();
  for (const [index, child] of result.children.entries()) {
    if (!child || typeof child !== "object") throw new Error(`children[${index}] is invalid.`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(child.id ?? "") || child.id.length < 3 || child.id.length > 64) {
      throw new Error(`children[${index}].id must be stable kebab-case.`);
    }
    if (ids.has(child.id)) throw new Error(`Duplicate child id: ${child.id}`);
    ids.add(child.id);
    assertText(child.title, `children[${index}].title`, { min: 5, max: 160 });
    assertText(child.outcome, `children[${index}].outcome`, { min: 10 });
    assertTextList(child.acceptanceCriteria, `children[${index}].acceptanceCriteria`, { itemMin: 3 });
    assertTextList(child.dependencies, `children[${index}].dependencies`);
    assertTextList(child.includedScope, `children[${index}].includedScope`, { itemMin: 3 });
    assertTextList(child.excludedScope, `children[${index}].excludedScope`, { itemMin: 3 });
    assertTextList(child.suggestedLabels, `children[${index}].suggestedLabels`, { min: 0, max: 10, itemMax: 50 });
    if (new Set(child.suggestedLabels).size !== child.suggestedLabels.length) {
      throw new Error(`children[${index}].suggestedLabels must be unique.`);
    }
  }
  return result;
}

export function encodeSplitProposal(result, digest) {
  validatePlanningResult(result);
  if (result.classification !== "split-required") {
    throw new Error("Only split-required results have a split proposal.");
  }
  const payload = Buffer.from(JSON.stringify({ digest, result }), "utf8").toString("base64url");
  return `${SPLIT_PROPOSAL_PREFIX}${payload} -->`;
}

export function decodeSplitProposal(comment) {
  const start = comment.indexOf(SPLIT_PROPOSAL_PREFIX);
  if (start < 0) return null;
  const encodedStart = start + SPLIT_PROPOSAL_PREFIX.length;
  const end = comment.indexOf(" -->", encodedStart);
  if (end < 0) throw new Error("Split proposal marker is malformed.");
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(comment.slice(encodedStart, end), "base64url").toString("utf8"));
  } catch {
    throw new Error("Split proposal payload is malformed.");
  }
  if (!/^[a-f0-9]{64}$/.test(parsed.digest ?? "")) {
    throw new Error("Split proposal fingerprint is invalid.");
  }
  validatePlanningResult(parsed.result);
  if (parsed.result.classification !== "split-required") {
    throw new Error("Embedded proposal is not split-required.");
  }
  return parsed;
}

export function approvedSplitProposal(comments) {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];
    if (!comment.body?.includes(SPLIT_PROPOSAL_PREFIX)) continue;
    const proposal = decodeSplitProposal(comment.body);
    const stageMarker = new RegExp(`<!-- codex-automation:(?:plan|revise):issue-\\d+:${proposal.digest} -->`);
    const login = comment.user?.login ?? comment.author?.login ?? "";
    const type = comment.user?.type ?? comment.author?.type ?? "";
    const trustedPlanningBot = login === "github-actions" || login === "github-actions[bot]";
    if (!stageMarker.test(comment.body) || (type && type !== "Bot") || !trustedPlanningBot) {
      throw new Error("Split proposal is not paired with a trusted planning result.");
    }
    return proposal;
  }
  throw new Error("A structured split proposal is required.");
}

export function validateSplitFingerprint(proposal, expectedDigest) {
  if (proposal.digest !== expectedDigest) {
    throw new Error("The approved split fingerprint changed before publication.");
  }
  return proposal;
}

export function renderPlanningDetails(result) {
  validatePlanningResult(result);
  if (result.classification === "focused") return "";
  if (result.classification === "needs-decision") {
    return `\n\n## Human decision required\n\n${result.blockingDecision}`;
  }
  const children = result.children.map((child, index) => {
    const criteria = child.acceptanceCriteria.map((item) => `- ${item}`).join("\n");
    const dependencies = child.dependencies.map((item) => `- ${item}`).join("\n");
    const included = child.includedScope.map((item) => `- ${item}`).join("\n");
    const excluded = child.excludedScope.map((item) => `- ${item}`).join("\n");
    const labels = child.suggestedLabels.length > 0 ? child.suggestedLabels.map((item) => `\`${item}\``).join(", ") : "None";
    return `### ${index + 1}. ${child.title}\n\n${child.outcome}\n\nAcceptance criteria:\n\n${criteria}\n\nDependencies:\n\n${dependencies}\n\nIncluded scope:\n\n${included}\n\nExcluded scope:\n\n${excluded}\n\nSuggested labels: ${labels}`;
  }).join("\n\n");
  return `\n\n## Proposed decomposition\n\n${result.splitReason}\n\n${children}`;
}

export function latestPlanIndex(comments) {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    if (comments[index].body?.includes(PLAN_MARKER)) return index;
  }
  return -1;
}

export function planningSnapshot(issue, comments, cutoff = null) {
  const cutoffTime = cutoff ? new Date(cutoff).getTime() : Number.POSITIVE_INFINITY;
  const eligibleComments = comments.filter((comment) => {
    const createdAt = comment.created_at ?? comment.createdAt;
    return !createdAt || new Date(createdAt).getTime() <= cutoffTime;
  });
  const planIndex = latestPlanIndex(eligibleComments);
  if (planIndex < 0) return null;

  const trustedAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
  return {
    issue: { number: issue.number, title: issue.title, body: issue.body ?? "" },
    comments: eligibleComments
      .slice(planIndex)
      .filter((comment, index) => {
        if (index === 0) return true;
        const association = comment.author_association ?? comment.authorAssociation ?? "NONE";
        const body = comment.body ?? "";
        return (
          trustedAssociations.has(association) ||
          body.includes(`${AUTOMATION_MARKER_PREFIX}revise:`) ||
          body.includes("<!-- codex-plan-amendment -->")
        );
      })
      .map((comment) => ({
        id: comment.id,
        author: comment.user?.login ?? comment.author?.login ?? "unknown",
        association: comment.author_association ?? comment.authorAssociation ?? "NONE",
        body: comment.body ?? "",
        createdAt: comment.created_at ?? comment.createdAt ?? "",
      })),
  };
}

export function buildContext({ issue, comments, stage, cutoff }) {
  const snapshot = planningSnapshot(issue, comments, cutoff);
  const source =
    stage === "plan"
      ? { issue: { number: issue.number, title: issue.title, body: issue.body ?? "" } }
      : snapshot;

  if (!source) throw new Error("A marked implementation plan is required.");
  const digest = fingerprint({ stage, source });
  return { digest, source, marker: marker(stage, issue.number, digest) };
}

const PULL_REQUEST_TITLE_MAX_LENGTH = 120;

function normalizedTitleText(value) {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function proposalOutcome(source) {
  const plan = source?.comments?.find((comment) => comment.body?.includes(PLAN_MARKER));
  if (!plan) return "";

  const proposal = plan.body.match(/^## Proposal\s*\n+([\s\S]*?)(?=^##\s|\s*$)/m)?.[1] ?? "";
  return normalizedTitleText(proposal);
}

export function implementationPullRequestTitle(issueNumber, source) {
  const prefix = `Implement #${issueNumber}: `;
  const fallback = "approved plan";
  const availableLength = PULL_REQUEST_TITLE_MAX_LENGTH - prefix.length;
  const outcome = proposalOutcome(source) || fallback;
  const title = outcome.length > availableLength
    ? `${outcome.slice(0, Math.max(availableLength - 1, 0)).trimEnd()}…`
    : outcome;

  return `${prefix}${title}`;
}

export function evaluateTrigger({
  enabled,
  actor,
  actorType,
  allowedActors,
  permission,
  issue,
  comments,
  requestedStage,
  cutoff,
}) {
  if (!enabled) return { action: "skip", reason: "Automation is disabled." };
  if (issue.state !== "open") return { action: "skip", reason: "Issue is not open." };
  if (actorType === "Bot" || actor.endsWith("[bot]")) {
    return { action: "skip", reason: "Bot triggers are not allowed." };
  }
  if (!allowedActors.includes(actor)) {
    return { action: "skip", reason: "Actor is not in CODEX_ALLOWED_ACTORS." };
  }
  if (!new Set(["write", "maintain", "admin"]).has(permission)) {
    return { action: "skip", reason: "Actor lacks write-level repository permission." };
  }

  const labels = issue.labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );
  const expectedLabel = Object.entries(STAGES).find(([, stage]) => stage === requestedStage)?.[0];
  if (!expectedLabel || !labels.includes(expectedLabel)) {
    return { action: "skip", reason: "The requested stage label is no longer present." };
  }

  if (requestedStage === "implement") {
    if (!labels.includes("approved-for-build")) {
      return { action: "block", reason: "Human approval for the documented plan is required." };
    }
    if (labels.includes("changes-requested")) {
      return { action: "block", reason: "Planning changes are still requested." };
    }
    const blockedStates = ["needs-decision", "split-proposed", "approved-for-split", "split-parent"];
    if (blockedStates.some((label) => labels.includes(label))) {
      return { action: "block", reason: "The issue is not in a focused implementation state." };
    }
  }

  if (requestedStage === "split") {
    try {
      const proposal = approvedSplitProposal(comments);
      return { action: "run", digest: proposal.digest, source: proposal.result };
    } catch (error) {
      return { action: "block", reason: error.message };
    }
  }

  let context;
  try {
    context = buildContext({ issue, comments, stage: requestedStage, cutoff });
  } catch (error) {
    return { action: "block", reason: error.message };
  }

  if (comments.some((comment) => comment.body?.includes(context.marker))) {
    return { action: "skip", reason: "This planning snapshot was already processed." };
  }

  return { action: "run", ...context };
}

export function validatePatch(patch, { maxBytes = 500_000 } = {}) {
  if (!patch.trim()) throw new Error("Codex produced an empty patch.");
  if (Buffer.byteLength(patch) > maxBytes) throw new Error("Patch exceeds the size limit.");
  if (/AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|BEGIN (?:RSA |EC )?PRIVATE KEY/.test(patch)) {
    throw new Error("Patch contains a credential-like value.");
  }

  const paths = [];
  for (const line of patch.split("\n")) {
    const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (!match) continue;
    for (const path of match.slice(1)) {
      if (path.startsWith("/") || path.split("/").includes("..") || path.startsWith(".git/")) {
        throw new Error(`Unsafe patch path: ${path}`);
      }
    }
    paths.push(match[2]);
  }
  if (paths.length === 0) throw new Error("Patch contains no file changes.");
  return paths;
}

export function validatePublicText(text, { maxBytes = 20_000 } = {}) {
  if (!text.trim()) throw new Error("Codex produced an empty response.");
  if (Buffer.byteLength(text) > maxBytes) throw new Error("Response exceeds the size limit.");
  if (/AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|BEGIN (?:RSA |EC )?PRIVATE KEY/.test(text)) {
    throw new Error("Response contains a credential-like value.");
  }
  return text;
}

export function transitionFor(stage, classification = "focused") {
  if (stage === "plan" || stage === "revise") {
    if (classification === "needs-decision") {
      return {
        remove: ["needs-planning", "changes-requested", "plan-ready", "split-proposed", "blocked"],
        add: ["needs-decision"],
      };
    }
    if (classification === "split-required") {
      return {
        remove: ["needs-planning", "changes-requested", "plan-ready", "needs-decision", "blocked"],
        add: ["split-proposed"],
      };
    }
    return {
      remove: ["needs-planning", "changes-requested", "needs-decision", "split-proposed", "blocked"],
      add: ["plan-ready"],
    };
  }
  if (stage === "split") {
    return {
      remove: ["split-proposed", "approved-for-split", "blocked"],
      add: ["split-parent"],
    };
  }
  return {
    remove: ["approved-for-build", "approved-for-ai-build", "plan-ready", "blocked"],
    add: ["in-progress"],
  };
}

export function failureTransitionFor(stage) {
  const triggerLabel = Object.entries(STAGES).find(([, value]) => value === stage)?.[0];
  return { remove: triggerLabel ? [triggerLabel] : [], add: ["blocked"] };
}

