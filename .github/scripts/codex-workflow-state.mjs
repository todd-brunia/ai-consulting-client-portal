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

const IMPLEMENTATION_APPROVALS = ["approved-for-build", "approved-for-ai-build"];
const TRUSTED_IMPLEMENTATION_VALIDATOR = "trusted-default-branch-workflow-state";

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

function assertUniqueTextList(value, name, options = {}) {
  const items = assertTextList(value, name, options);
  const normalized = items.map((item) => item.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${name} must not contain duplicate items.`);
  }
  return items;
}

function validatePlanningClassificationFields(result) {
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
  validateSplitChildren(result.children);
  return result;
}

function validateSplitChildren(children) {
  if (!Array.isArray(children) || children.length < 2 || children.length > 10) {
    throw new Error("A split proposal must contain 2-10 children.");
  }
  const ids = new Set();
  for (const [index, child] of children.entries()) {
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
}

function assertSafeDecisionText(value, name, options) {
  const text = assertText(value, name, options);
  const sensitiveRequest = /\b(?:paste|post|provide|publish|request|send|share|enter|supply)\b.{0,40}\b(?:credentials?|passwords?|private keys?|secrets?|tokens?)\b/gi;
  const safeNegation = /\b(?:do not|don't|never)\s+(?:paste|post|provide|publish|request|send|share|enter|supply)\b.{0,40}\b(?:credentials?|passwords?|private keys?|secrets?|tokens?)\b/gi;
  if (text.replace(safeNegation, "").match(sensitiveRequest)) {
    throw new Error(`${name} must not request sensitive values in public text.`);
  }
  return text;
}

function validateDecisionFieldsV2(result) {
  const decisionFields = [
    result.decisionOptions,
    result.recommendedOptionId,
    result.recommendationRationale,
  ];
  if (result.classification !== "needs-decision") {
    if (decisionFields.some((value) => value !== null)) {
      throw new Error("Decision-only fields must be null unless classification is needs-decision.");
    }
    return;
  }

  if (!Array.isArray(result.decisionOptions) || result.decisionOptions.length < 2 || result.decisionOptions.length > 4) {
    throw new Error("decisionOptions must contain 2-4 options for needs-decision.");
  }
  assertSafeDecisionText(result.blockingDecision, "blockingDecision", { min: 10, max: 2_000 });
  const ids = new Set();
  const labels = new Set();
  for (const [index, option] of result.decisionOptions.entries()) {
    if (!option || typeof option !== "object") throw new Error(`decisionOptions[${index}] is invalid.`);
    const id = assertSafeDecisionText(option.id, `decisionOptions[${index}].id`, { min: 3, max: 64 });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error(`decisionOptions[${index}].id must be stable kebab-case.`);
    }
    const label = assertSafeDecisionText(option.label, `decisionOptions[${index}].label`, { min: 3, max: 120 });
    const description = assertSafeDecisionText(option.description, `decisionOptions[${index}].description`, { min: 10, max: 1_000 });
    assertUniqueTextList(option.tradeoffs, `decisionOptions[${index}].tradeoffs`, {
      min: 1,
      max: 6,
      itemMin: 5,
      itemMax: 500,
    }).forEach((tradeoff, tradeoffIndex) => {
      assertSafeDecisionText(tradeoff, `decisionOptions[${index}].tradeoffs[${tradeoffIndex}]`, { min: 5, max: 500 });
      if (/^(?:none|n\/?a|not applicable|no tradeoffs?|tbd|to be determined)[.!]?$/i.test(tradeoff.trim())) {
        throw new Error(`decisionOptions[${index}].tradeoffs must not contain generic filler.`);
      }
    });
    const normalizedLabel = label.trim().toLowerCase();
    if (ids.has(id)) throw new Error(`Duplicate decision option id: ${id}`);
    if (labels.has(normalizedLabel)) throw new Error(`Duplicate decision option label: ${label}`);
    if (/^(?:none|n\/?a|tbd|to be determined|option [a-d]|choice [1-4]|other)[.!]?$/i.test(label.trim()) ||
        /^(?:none|n\/?a|not applicable|to be determined|choose this option)[.!]?$/i.test(description.trim())) {
      throw new Error(`decisionOptions[${index}] must not contain generic filler.`);
    }
    ids.add(id);
    labels.add(normalizedLabel);
  }
  const recommendationId = assertSafeDecisionText(result.recommendedOptionId, "recommendedOptionId", {
    min: 3,
    max: 64,
  });
  if (!ids.has(recommendationId)) {
    throw new Error("recommendedOptionId must reference a supplied decision option.");
  }
  const rationale = assertSafeDecisionText(result.recommendationRationale, "recommendationRationale", {
    min: 20,
    max: 2_000,
  });
  if (/\b(?:certainly|definitely|guarantee(?:d|s)?|without (?:any )?risk|no downside)\b/i.test(rationale)) {
    throw new Error("recommendationRationale must not claim unsupported certainty.");
  }
  if (/^(?:this|the) option is recommended(?: because it is (?:best|preferred))?[.!]?$/i.test(rationale.trim())) {
    throw new Error("recommendationRationale must not contain generic filler.");
  }
}

export function validatePlanningResult(result) {
  if (!result || typeof result !== "object" || !PLANNING_CLASSIFICATIONS.has(result.classification)) {
    throw new Error("Planning result has an invalid classification.");
  }
  assertText(result.markdown, "markdown", { min: 40, max: 12_000 });

  return validatePlanningClassificationFields(result);
}

export function validatePlanningResultV2(result) {
  if (!result || typeof result !== "object" || result.contractVersion !== "plan/v2") {
    throw new Error('Planning result contractVersion must be "plan/v2".');
  }
  if (!PLANNING_CLASSIFICATIONS.has(result.classification)) {
    throw new Error("Planning result has an invalid classification.");
  }

  assertText(result.objective, "objective", { min: 10, max: 500 });
  assertText(result.executiveSummary, "executiveSummary", { min: 40, max: 4_000 });
  assertUniqueTextList(result.keyDecisions, "keyDecisions", { min: 1, max: 12, itemMin: 5, itemMax: 500 });
  assertUniqueTextList(result.tradeoffs, "tradeoffs", { min: 0, max: 12, itemMin: 5, itemMax: 500 });
  assertUniqueTextList(result.risks, "risks", { min: 0, max: 12, itemMin: 5, itemMax: 500 });
  assertUniqueTextList(result.openQuestions, "openQuestions", { min: 0, max: 12, itemMin: 5, itemMax: 500 });

  if (!Array.isArray(result.fileChanges) || result.fileChanges.length < 1 || result.fileChanges.length > 50) {
    throw new Error("fileChanges must contain 1-50 items.");
  }
  const paths = new Set();
  for (const [index, fileChange] of result.fileChanges.entries()) {
    if (!fileChange || typeof fileChange !== "object") throw new Error(`fileChanges[${index}] is invalid.`);
    const path = assertText(fileChange.path, `fileChanges[${index}].path`, { min: 1, max: 500 });
    assertText(fileChange.change, `fileChanges[${index}].change`, { min: 5, max: 500 });
    if (paths.has(path)) throw new Error(`Duplicate fileChanges path: ${path}`);
    paths.add(path);
  }

  assertUniqueTextList(result.implementationOrder, "implementationOrder", {
    min: 1,
    max: 20,
    itemMin: 5,
    itemMax: 1_000,
  });
  if (!Array.isArray(result.teachMe) || result.teachMe.length > 10) {
    throw new Error("teachMe must contain 0-10 items.");
  }
  const concepts = new Set();
  for (const [index, entry] of result.teachMe.entries()) {
    if (!entry || typeof entry !== "object") throw new Error(`teachMe[${index}] is invalid.`);
    const concept = assertText(entry.concept, `teachMe[${index}].concept`, { min: 3, max: 160 });
    assertText(entry.whatItIs, `teachMe[${index}].whatItIs`, { min: 10, max: 1_000 });
    assertText(entry.whyUsed, `teachMe[${index}].whyUsed`, { min: 10, max: 1_000 });
    assertText(entry.whyPreferred, `teachMe[${index}].whyPreferred`, { min: 10, max: 1_000 });
    const normalized = concept.trim().toLowerCase();
    if (concepts.has(normalized)) throw new Error(`Duplicate teachMe concept: ${concept}`);
    concepts.add(normalized);
  }
  const challengePoints = assertUniqueTextList(result.reviewerChallengePoints, "reviewerChallengePoints", {
    min: 0,
    max: 5,
    itemMin: 10,
    itemMax: 500,
  });
  if (challengePoints.some((item) => /^(?:none|n\/?a|not applicable|no (?:material )?(?:challenge|concern)s?)[.!]?$/i.test(item.trim()))) {
    throw new Error("reviewerChallengePoints must not contain generic filler.");
  }
  assertText(result.machineImplementationDetails, "machineImplementationDetails", { min: 40, max: 12_000 });
  validateDecisionFieldsV2(result);

  return validatePlanningClassificationFields(result);
}

export function validatePlanningResultForContract(result) {
  return result?.contractVersion === "plan/v2"
    ? validatePlanningResultV2(result)
    : validatePlanningResult(result);
}

export function encodeSplitProposal(result, digest) {
  validatePlanningResultForContract(result);
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
  validatePlanningResultForContract(parsed.result);
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

function renderList(items, { ordered = false, empty = "None." } = {}) {
  if (items.length === 0) return empty;
  return items.map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${item}`).join("\n");
}

function renderSplitChildren(children) {
  return children.map((child, index) => {
    const criteria = renderList(child.acceptanceCriteria);
    const dependencies = renderList(child.dependencies);
    const included = renderList(child.includedScope);
    const excluded = renderList(child.excludedScope);
    const labels = child.suggestedLabels.length > 0
      ? child.suggestedLabels.map((item) => `\`${item}\``).join(", ")
      : "None";
    return `#### ${index + 1}. ${child.title}\n\n${child.outcome}\n\nAcceptance criteria:\n\n${criteria}\n\nDependencies:\n\n${dependencies}\n\nIncluded scope:\n\n${included}\n\nExcluded scope:\n\n${excluded}\n\nSuggested labels: ${labels}`;
  }).join("\n\n");
}

export function renderPlanningResultV2(result) {
  validatePlanningResultV2(result);
  const fileChanges = result.fileChanges
    .map(({ path, change }) => `- \`${path}\` — ${change}`)
    .join("\n");
  let classificationDetails = "";
  if (result.classification === "needs-decision") {
    const options = result.decisionOptions.map((option, index) => {
      const recommended = option.id === result.recommendedOptionId ? " — Recommended" : "";
      return `#### ${index + 1}. ${option.label}${recommended}\n\n${option.description}\n\nTradeoffs:\n\n${renderList(option.tradeoffs)}`;
    }).join("\n\n");
    classificationDetails = `\n\n### Human Decision Required\n\n**Question:** ${result.blockingDecision}\n\n${options}\n\n#### Advisory Recommendation\n\n**Recommended option:** ${result.decisionOptions.find((option) => option.id === result.recommendedOptionId).label}\n\n${result.recommendationRationale}\n\nThis recommendation is advisory. The issue remains \`needs-decision\` until a human records a choice and returns it to planning.`;
  } else if (result.classification === "split-required") {
    classificationDetails = `\n\n### Proposed Decomposition\n\n${result.splitReason}\n\n${renderSplitChildren(result.children)}`;
  }
  const teachMe = result.teachMe.length === 0
    ? "No issue-specific concepts require explanation for this plan."
    : result.teachMe.map((entry) => `### ${entry.concept}\n\n**What it is:** ${entry.whatItIs}\n\n**Why it is used here:** ${entry.whyUsed}\n\n**Why it is preferred:** ${entry.whyPreferred}`).join("\n\n");
  const challenges = renderList(result.reviewerChallengePoints, {
    empty: "No material decisions require an additional reviewer challenge.",
  });

  return `## Human Review Summary\n\n### Objective\n\n${result.objective}\n\n### Executive Summary\n\n${result.executiveSummary}\n\n### Key Decisions\n\n${renderList(result.keyDecisions)}\n\n### Tradeoffs\n\n${renderList(result.tradeoffs)}\n\n### Risks\n\n${renderList(result.risks)}\n\n### Open Questions\n\n${renderList(result.openQuestions)}\n\n### File Impacts\n\n${fileChanges}\n\n### Implementation Sequence\n\n${renderList(result.implementationOrder, { ordered: true })}${classificationDetails}\n\n## Teach Me\n\n${teachMe}\n\n## Decisions the Reviewer Should Challenge\n\n${challenges}\n\n## Machine Implementation Details\n\n${result.machineImplementationDetails}`;
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

export function buildContext({ issue, comments, stage, cutoff, authorization }) {
  const snapshot = planningSnapshot(issue, comments, cutoff);
  const source =
    stage === "plan"
      ? { issue: { number: issue.number, title: issue.title, body: issue.body ?? "" } }
      : snapshot;

  if (!source) throw new Error("A marked implementation plan is required.");
  const fingerprintSource = authorization ? { stage, source, authorization } : { stage, source };
  const digest = fingerprint(fingerprintSource);
  return { digest, source, authorization, marker: marker(stage, issue.number, digest) };
}

function implementationAuthorization(labels, validationCutoff) {
  const cutoff = new Date(validationCutoff);
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error("Implementation approval validation requires an immutable workflow cutoff.");
  }
  if (IMPLEMENTATION_APPROVALS.some((label) => !labels.includes(label))) {
    throw new Error("Both human approval labels must be present when implementation state is validated.");
  }

  return {
    validator: TRUSTED_IMPLEMENTATION_VALIDATOR,
    validationCutoff: cutoff.toISOString(),
    approvals: {
      approvedForBuild: true,
      approvedForAiBuild: true,
    },
  };
}

export function validateImplementationAuthorization(authorization) {
  if (!authorization || typeof authorization !== "object" || Array.isArray(authorization)) {
    throw new Error("Authorization refused: trusted implementation authorization is required.");
  }
  if (authorization.validator !== TRUSTED_IMPLEMENTATION_VALIDATOR) {
    throw new Error("Authorization refused: untrusted validator.");
  }

  const cutoff = new Date(authorization.validationCutoff);
  if (
    Number.isNaN(cutoff.getTime()) ||
    authorization.validationCutoff !== cutoff.toISOString()
  ) {
    throw new Error("Authorization refused: stale or invalid workflow cutoff.");
  }
  if (
    authorization.approvals?.approvedForBuild !== true ||
    authorization.approvals?.approvedForAiBuild !== true
  ) {
    throw new Error("Authorization refused: both trusted human approvals are required.");
  }

  return authorization;
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

  const legacyProposal = plan.body.match(/^## Proposal\s*\n+([\s\S]*?)(?=^##\s|\s*$)/m)?.[1] ?? "";
  const structuredObjective = plan.body.match(/^### Objective\s*\n+([\s\S]*?)(?=^#{2,4}\s|\s*$)/m)?.[1] ?? "";
  return normalizedTitleText(legacyProposal || structuredObjective);
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
  let authorization;
  if (requestedStage === "implement") {
    if (IMPLEMENTATION_APPROVALS.some((label) => !labels.includes(label))) {
      return { action: "block", reason: "Both human approval labels are required for implementation." };
    }
    if (labels.includes("changes-requested")) {
      return { action: "block", reason: "Planning changes are still requested." };
    }
    const blockedStates = ["needs-decision", "split-proposed", "approved-for-split", "split-parent"];
    if (blockedStates.some((label) => labels.includes(label))) {
      return { action: "block", reason: "The issue is not in a focused implementation state." };
    }
    try {
      authorization = implementationAuthorization(labels, cutoff);
    } catch (error) {
      return { action: "block", reason: error.message };
    }
  } else {
    const expectedLabel = Object.entries(STAGES).find(([, stage]) => stage === requestedStage)?.[0];
    if (!expectedLabel || !labels.includes(expectedLabel)) {
      return { action: "skip", reason: "The requested stage label is no longer present." };
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
    context = buildContext({ issue, comments, stage: requestedStage, cutoff, authorization });
  } catch (error) {
    return { action: "block", reason: error.message };
  }

  if (comments.some((comment) => comment.body?.includes(context.marker))) {
    return { action: "skip", reason: "This planning snapshot was already processed." };
  }

  return { action: "run", ...context };
}

export function evaluateSplitPlanHandoff({
  parent,
  parentComments,
  child,
  childComments,
  parentNumber,
  childId,
  digest,
  requestedStage,
}) {
  if (requestedStage !== "plan") {
    return { action: "block", reason: "Split handoffs may request only the plan stage." };
  }
  if (!Number.isSafeInteger(parentNumber) || parentNumber < 1 || parent.number !== parentNumber) {
    return { action: "block", reason: "The split parent identity is invalid." };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(childId ?? "") || childId.length > 64) {
    return { action: "block", reason: "The split child identity is invalid." };
  }
  if (!/^[a-f0-9]{64}$/.test(digest ?? "")) {
    return { action: "block", reason: "The split fingerprint is invalid." };
  }

  try {
    const proposal = approvedSplitProposal(parentComments);
    validateSplitFingerprint(proposal, digest);
    if (!proposal.result.children.some((candidate) => candidate.id === childId)) {
      throw new Error("The child id is not present in the approved split proposal.");
    }
  } catch (error) {
    return { action: "block", reason: error.message };
  }

  const parentLabels = parent.labels.map((label) => typeof label === "string" ? label : label.name);
  if (parent.state !== "closed" || !parentLabels.includes("split-parent")) {
    return { action: "block", reason: "The approved split has not completed." };
  }
  if (child.state !== "open") return { action: "skip", reason: "The child is not open." };

  const expectedMarker = `${SPLIT_CHILD_PREFIX}parent-${parentNumber}:${childId}:${digest} -->`;
  const childMarkers = child.body?.match(/<!-- codex-split-child:[^\n]* -->/g) ?? [];
  if (childMarkers.length !== 1 || childMarkers[0] !== expectedMarker) {
    return { action: "block", reason: "The child does not have the exact publisher-produced split marker." };
  }

  const labels = child.labels.map((label) => typeof label === "string" ? label : label.name);
  const advancedStates = STATE_LABELS.filter((label) => label !== "needs-planning");
  if (advancedStates.some((label) => labels.includes(label))) {
    return { action: "skip", reason: "The child has advanced beyond needs-planning." };
  }
  if (!labels.includes("needs-planning")) {
    return { action: "skip", reason: "The child no longer requests planning." };
  }
  if (childComments.some((comment) => comment.body?.includes(PLAN_MARKER))) {
    return { action: "skip", reason: "The child already has a current planning marker." };
  }

  const authorization = {
    type: "approved-split-plan-handoff",
    parentNumber,
    childId,
    splitFingerprint: digest,
    stage: "plan",
  };
  const context = buildContext({ issue: child, comments: childComments, stage: "plan", authorization });
  if (childComments.some((comment) => comment.body?.includes(context.marker))) {
    return { action: "skip", reason: "This split planning handoff was already processed." };
  }
  return { action: "run", ...context };
}

const PATCH_METADATA_PATTERN =
  /^(?:index [0-9a-f]+\.\.[0-9a-f]+(?: \d+)?|(?:old|new|new file|deleted file) mode \d+|similarity index \d+%|dissimilarity index \d+%|rename (?:from|to) .+|copy (?:from|to) .+|--- (?:a\/.+|\/dev\/null)|\+\+\+ (?:b\/.+|\/dev\/null))$/;

function addedPatchContent(patch) {
  const added = [];
  let sawFile = false;
  let inHunk = false;
  let canSeparateCompletedHunks = false;
  let oldRemaining = 0;
  let newRemaining = 0;

  const malformedDiff = (lineNumber, category) => {
    throw new Error(`Patch contains malformed diff content at line ${lineNumber} (${category}).`);
  };
  const malformedHunk = (lineNumber, category) => {
    throw new Error(`Patch contains a malformed diff hunk at line ${lineNumber} (${category}).`);
  };
  const finishHunk = (lineNumber) => {
    if (inHunk && (oldRemaining !== 0 || newRemaining !== 0)) {
      malformedHunk(lineNumber, "incomplete hunk");
    }
    inHunk = false;
  };

  const lines = patch.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("diff --git ")) {
      finishHunk(index + 1);
      sawFile = true;
      canSeparateCompletedHunks = false;
      continue;
    }
    if (!sawFile) {
      if (line === "" && index === lines.length - 1) continue;
      malformedDiff(index + 1, "expected file header");
    }
    if (line === "GIT binary patch" || /^Binary files .+ differ$/.test(line)) {
      throw new Error("Patch contains unsupported binary changes.");
    }

    const hunk = line.match(/^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?: .*)?$/);
    if (hunk) {
      finishHunk(index + 1);
      inHunk = true;
      oldRemaining = hunk[1] === undefined ? 1 : Number(hunk[1]);
      newRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
      continue;
    }

    if (inHunk) {
      if (line === "\\ No newline at end of file") continue;
      const prefix = line[0];
      if (prefix === " ") {
        oldRemaining -= 1;
        newRemaining -= 1;
      } else if (prefix === "-") {
        oldRemaining -= 1;
      } else if (prefix === "+") {
        newRemaining -= 1;
        added.push(line.slice(1));
      } else {
        malformedDiff(index + 1, "invalid hunk line");
      }
      if (oldRemaining < 0 || newRemaining < 0) {
        malformedHunk(index + 1, "hunk length exceeded");
      }
      if (oldRemaining === 0 && newRemaining === 0) {
        inHunk = false;
        canSeparateCompletedHunks = true;
      }
      continue;
    }

    if (line === "" && index === lines.length - 1) continue;
    if (line === "" && canSeparateCompletedHunks) continue;
    if (line === "\\ No newline at end of file") continue;
    if (!PATCH_METADATA_PATTERN.test(line)) {
      malformedDiff(index + 1, "invalid file metadata");
    }
    canSeparateCompletedHunks = false;
  }

  finishHunk(lines.length);
  return added.join("\n");
}

export function validatePatch(patch, options = {}) {
  const { maxBytes = 500_000 } = options;
  if (Object.hasOwn(options, "authorization")) {
    validateImplementationAuthorization(options.authorization);
  }
  if (!patch.trim()) throw new Error("Codex produced an empty patch.");
  if (Buffer.byteLength(patch) > maxBytes) throw new Error("Patch exceeds the size limit.");
  const addedContent = addedPatchContent(patch);
  if (/AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|BEGIN (?:RSA |EC )?PRIVATE KEY/.test(addedContent)) {
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
