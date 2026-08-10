import { createHash } from "node:crypto";

export const PLAN_MARKER = "<!-- codex-implementation-plan -->";
export const AUTOMATION_MARKER_PREFIX = "<!-- codex-automation:";
export const SPLIT_PROPOSAL_PREFIX = "<!-- codex-split-proposal:";
export const SPLIT_CHILD_PREFIX = "<!-- codex-split-child:";
export const SPLIT_CHECKLIST_PREFIX = "<!-- codex-split-checklist:";
export const SPLIT_ENVELOPE_VERSION = "split/v2";
export const PLANNING_COMMENT_BUDGETS = Object.freeze({
  visibleBytes: 14_000,
  machineBytes: 5_500,
  framingBytes: 500,
  combinedBytes: 20_000,
});
export const PLAN_V2_LIMITS = Object.freeze({
  objective: Object.freeze({ min: 10, max: 500 }),
  executiveSummary: Object.freeze({ min: 40, max: 4_000 }),
  keyDecisions: Object.freeze({ min: 1, max: 12, itemMin: 5, itemMax: 500 }),
  optionalReviewLists: Object.freeze({ min: 0, max: 12, itemMin: 5, itemMax: 500 }),
  fileChanges: Object.freeze({ min: 1, max: 50, pathMin: 1, pathMax: 500, changeMin: 5, changeMax: 500 }),
  implementationOrder: Object.freeze({ min: 1, max: 20, itemMin: 5, itemMax: 1_000 }),
  teachMe: Object.freeze({ min: 0, max: 10, conceptMin: 3, conceptMax: 160, detailMin: 10, detailMax: 1_000 }),
  reviewerChallengePoints: Object.freeze({ min: 0, max: 5, itemMin: 10, itemMax: 500 }),
  machineImplementationDetails: Object.freeze({ min: 40, max: 12_000 }),
  blockingDecision: Object.freeze({ min: 10, max: 2_000 }),
  splitReason: Object.freeze({ min: 10, max: 2_000 }),
  children: Object.freeze({
    min: 2,
    max: 10,
    idMin: 3,
    idMax: 64,
    titleMin: 5,
    titleMax: 160,
    outcomeMin: 10,
    outcomeMax: 2_000,
    listMin: 1,
    listMax: 12,
    listItemMax: 500,
    substantiveItemMin: 3,
    suggestedLabelsMin: 0,
    suggestedLabelsMax: 10,
    suggestedLabelMax: 50,
  }),
  decisionOptions: Object.freeze({ min: 2, max: 4, idMin: 3, idMax: 64, labelMin: 3, labelMax: 120, descriptionMin: 10, descriptionMax: 1_000 }),
  decisionTradeoffs: Object.freeze({ min: 1, max: 6, itemMin: 5, itemMax: 500 }),
  recommendationRationale: Object.freeze({ min: 20, max: 2_000 }),
});

export function renderPlanV2ConstraintReference() {
  const limits = PLAN_V2_LIMITS;
  return `### Required plan/v2 constraint reference

- Text lengths: objective ${limits.objective.min}-${limits.objective.max}; executiveSummary ${limits.executiveSummary.min}-${limits.executiveSummary.max}; machineImplementationDetails ${limits.machineImplementationDetails.min}-${limits.machineImplementationDetails.max}; blockingDecision and splitReason ${limits.blockingDecision.min}-${limits.blockingDecision.max} characters when applicable.
- Review lists: keyDecisions ${limits.keyDecisions.min}-${limits.keyDecisions.max} items of ${limits.keyDecisions.itemMin}-${limits.keyDecisions.itemMax} characters; tradeoffs, risks, and openQuestions ${limits.optionalReviewLists.min}-${limits.optionalReviewLists.max} items of ${limits.optionalReviewLists.itemMin}-${limits.optionalReviewLists.itemMax}; implementationOrder ${limits.implementationOrder.min}-${limits.implementationOrder.max} items of ${limits.implementationOrder.itemMin}-${limits.implementationOrder.itemMax}; reviewerChallengePoints ${limits.reviewerChallengePoints.min}-${limits.reviewerChallengePoints.max} items of ${limits.reviewerChallengePoints.itemMin}-${limits.reviewerChallengePoints.itemMax}; every review list is unique after trim/case normalization.
- Structured sections: fileChanges ${limits.fileChanges.min}-${limits.fileChanges.max} entries with unique ${limits.fileChanges.pathMin}-${limits.fileChanges.pathMax}-character paths and ${limits.fileChanges.changeMin}-${limits.fileChanges.changeMax}-character changes; teachMe ${limits.teachMe.min}-${limits.teachMe.max} entries with unique ${limits.teachMe.conceptMin}-${limits.teachMe.conceptMax}-character concepts and ${limits.teachMe.detailMin}-${limits.teachMe.detailMax}-character explanations; decisionOptions ${limits.decisionOptions.min}-${limits.decisionOptions.max} entries with unique ${limits.decisionOptions.idMin}-${limits.decisionOptions.idMax}-character kebab-case IDs, unique ${limits.decisionOptions.labelMin}-${limits.decisionOptions.labelMax}-character labels, ${limits.decisionOptions.descriptionMin}-${limits.decisionOptions.descriptionMax}-character descriptions, and ${limits.decisionTradeoffs.min}-${limits.decisionTradeoffs.max} unique ${limits.decisionTradeoffs.itemMin}-${limits.decisionTradeoffs.itemMax}-character non-filler tradeoffs; recommendationRationale is ${limits.recommendationRationale.min}-${limits.recommendationRationale.max} characters.
- Split proposals: ${limits.children.min}-${limits.children.max} children with unique ${limits.children.idMin}-${limits.children.idMax}-character kebab-case IDs, ${limits.children.titleMin}-${limits.children.titleMax}-character titles, outcomes and splitReason of at least 10 characters, 1-12 acceptance/dependency/included/excluded items of at most 500 characters, and 0-10 unique suggested labels of at most 50 characters per child.
- Classification coupling: focused uses null for all decision and split fields; needs-decision supplies all decision fields and null split fields; split-required supplies splitReason and children and null decision fields.
- Public safety: all strings reject credentials and reserved automation markers; decision text also rejects requests for sensitive values, generic filler, and unsupported certainty; duplicate checks normalize reviewer text case and surrounding whitespace.
- Publication budgets: visible Markdown ${PLANNING_COMMENT_BUDGETS.visibleBytes} bytes, machine payload ${PLANNING_COMMENT_BUDGETS.machineBytes} bytes, framing ${PLANNING_COMMENT_BUDGETS.framingBytes} bytes, and combined comment ${PLANNING_COMMENT_BUDGETS.combinedBytes} bytes. Never truncate material content to fit.`;
}
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

function assertExactKeys(value, expected, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${name} has unexpected or missing fields.`);
  }
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
    assertText(result.blockingDecision, "blockingDecision", PLAN_V2_LIMITS.blockingDecision);
    if (result.splitReason !== null || result.children !== null) {
      throw new Error("Needs-decision split fields must be null.");
    }
    return result;
  }

  if (result.blockingDecision !== null) {
    throw new Error("Split-required blockingDecision must be null.");
  }
  assertText(result.splitReason, "splitReason", PLAN_V2_LIMITS.splitReason);
  validateSplitChildren(result.children);
  return result;
}

function validateSplitChildren(children) {
  const limits = PLAN_V2_LIMITS.children;
  if (!Array.isArray(children) || children.length < limits.min || children.length > limits.max) {
    throw new Error(`A split proposal must contain ${limits.min}-${limits.max} children.`);
  }
  const ids = new Set();
  for (const [index, child] of children.entries()) {
    if (!child || typeof child !== "object") throw new Error(`children[${index}] is invalid.`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(child.id ?? "") || child.id.length < limits.idMin || child.id.length > limits.idMax) {
      throw new Error(`children[${index}].id must be stable kebab-case.`);
    }
    if (ids.has(child.id)) throw new Error(`Duplicate child id: ${child.id}`);
    ids.add(child.id);
    assertText(child.title, `children[${index}].title`, { min: limits.titleMin, max: limits.titleMax });
    assertText(child.outcome, `children[${index}].outcome`, { min: limits.outcomeMin, max: limits.outcomeMax });
    const substantiveList = { min: limits.listMin, max: limits.listMax, itemMin: limits.substantiveItemMin, itemMax: limits.listItemMax };
    const dependencyList = { min: limits.listMin, max: limits.listMax, itemMin: 1, itemMax: limits.listItemMax };
    assertTextList(child.acceptanceCriteria, `children[${index}].acceptanceCriteria`, substantiveList);
    assertTextList(child.dependencies, `children[${index}].dependencies`, dependencyList);
    assertTextList(child.includedScope, `children[${index}].includedScope`, substantiveList);
    assertTextList(child.excludedScope, `children[${index}].excludedScope`, substantiveList);
    assertTextList(child.suggestedLabels, `children[${index}].suggestedLabels`, {
      min: limits.suggestedLabelsMin,
      max: limits.suggestedLabelsMax,
      itemMax: limits.suggestedLabelMax,
    });
    if (new Set(child.suggestedLabels).size !== child.suggestedLabels.length) {
      throw new Error(`children[${index}].suggestedLabels must be unique.`);
    }
  }
}

const SPLIT_CHILD_KEYS = [
  "id",
  "title",
  "outcome",
  "acceptanceCriteria",
  "dependencies",
  "includedScope",
  "excludedScope",
  "suggestedLabels",
];

function normalizeSplitChildren(children) {
  validateSplitChildren(children);
  return children.map((child) => Object.fromEntries(
    SPLIT_CHILD_KEYS.map((key) => [key, Array.isArray(child[key]) ? [...child[key]] : child[key]]),
  ));
}

function validateSplitEnvelope(envelope) {
  assertExactKeys(envelope, ["version", "digest", "children"], "Split envelope");
  if (envelope.version !== SPLIT_ENVELOPE_VERSION) {
    throw new Error("Split envelope version is not supported.");
  }
  if (!/^[a-f0-9]{64}$/.test(envelope.digest ?? "")) {
    throw new Error("Split proposal fingerprint is invalid.");
  }
  for (const [index, child] of (envelope.children ?? []).entries()) {
    assertExactKeys(child, SPLIT_CHILD_KEYS, `Split envelope children[${index}]`);
  }
  validateSplitChildren(envelope.children);
  return envelope;
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

  const optionLimits = PLAN_V2_LIMITS.decisionOptions;
  if (!Array.isArray(result.decisionOptions) || result.decisionOptions.length < optionLimits.min || result.decisionOptions.length > optionLimits.max) {
    throw new Error(`decisionOptions must contain ${optionLimits.min}-${optionLimits.max} options for needs-decision.`);
  }
  assertSafeDecisionText(result.blockingDecision, "blockingDecision", PLAN_V2_LIMITS.blockingDecision);
  const ids = new Set();
  const labels = new Set();
  for (const [index, option] of result.decisionOptions.entries()) {
    if (!option || typeof option !== "object") throw new Error(`decisionOptions[${index}] is invalid.`);
    const id = assertSafeDecisionText(option.id, `decisionOptions[${index}].id`, { min: optionLimits.idMin, max: optionLimits.idMax });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error(`decisionOptions[${index}].id must be stable kebab-case.`);
    }
    const label = assertSafeDecisionText(option.label, `decisionOptions[${index}].label`, { min: optionLimits.labelMin, max: optionLimits.labelMax });
    const description = assertSafeDecisionText(option.description, `decisionOptions[${index}].description`, { min: optionLimits.descriptionMin, max: optionLimits.descriptionMax });
    assertUniqueTextList(option.tradeoffs, `decisionOptions[${index}].tradeoffs`, {
      ...PLAN_V2_LIMITS.decisionTradeoffs,
    }).forEach((tradeoff, tradeoffIndex) => {
      assertSafeDecisionText(tradeoff, `decisionOptions[${index}].tradeoffs[${tradeoffIndex}]`, {
        min: PLAN_V2_LIMITS.decisionTradeoffs.itemMin,
        max: PLAN_V2_LIMITS.decisionTradeoffs.itemMax,
      });
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
    min: optionLimits.idMin,
    max: optionLimits.idMax,
  });
  if (!ids.has(recommendationId)) {
    throw new Error("recommendedOptionId must reference a supplied decision option.");
  }
  const rationale = assertSafeDecisionText(result.recommendationRationale, "recommendationRationale", PLAN_V2_LIMITS.recommendationRationale);
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

  assertText(result.objective, "objective", PLAN_V2_LIMITS.objective);
  assertText(result.executiveSummary, "executiveSummary", PLAN_V2_LIMITS.executiveSummary);
  assertUniqueTextList(result.keyDecisions, "keyDecisions", PLAN_V2_LIMITS.keyDecisions);
  assertUniqueTextList(result.tradeoffs, "tradeoffs", PLAN_V2_LIMITS.optionalReviewLists);
  assertUniqueTextList(result.risks, "risks", PLAN_V2_LIMITS.optionalReviewLists);
  assertUniqueTextList(result.openQuestions, "openQuestions", PLAN_V2_LIMITS.optionalReviewLists);

  const fileLimits = PLAN_V2_LIMITS.fileChanges;
  if (!Array.isArray(result.fileChanges) || result.fileChanges.length < fileLimits.min || result.fileChanges.length > fileLimits.max) {
    throw new Error(`fileChanges must contain ${fileLimits.min}-${fileLimits.max} items.`);
  }
  const paths = new Set();
  for (const [index, fileChange] of result.fileChanges.entries()) {
    if (!fileChange || typeof fileChange !== "object") throw new Error(`fileChanges[${index}] is invalid.`);
    const path = assertText(fileChange.path, `fileChanges[${index}].path`, { min: fileLimits.pathMin, max: fileLimits.pathMax });
    assertText(fileChange.change, `fileChanges[${index}].change`, { min: fileLimits.changeMin, max: fileLimits.changeMax });
    if (paths.has(path)) throw new Error(`Duplicate fileChanges path: ${path}`);
    paths.add(path);
  }

  assertUniqueTextList(result.implementationOrder, "implementationOrder", PLAN_V2_LIMITS.implementationOrder);
  const teachLimits = PLAN_V2_LIMITS.teachMe;
  if (!Array.isArray(result.teachMe) || result.teachMe.length < teachLimits.min || result.teachMe.length > teachLimits.max) {
    throw new Error(`teachMe must contain ${teachLimits.min}-${teachLimits.max} items.`);
  }
  const concepts = new Set();
  for (const [index, entry] of result.teachMe.entries()) {
    if (!entry || typeof entry !== "object") throw new Error(`teachMe[${index}] is invalid.`);
    const concept = assertText(entry.concept, `teachMe[${index}].concept`, { min: teachLimits.conceptMin, max: teachLimits.conceptMax });
    assertText(entry.whatItIs, `teachMe[${index}].whatItIs`, { min: teachLimits.detailMin, max: teachLimits.detailMax });
    assertText(entry.whyUsed, `teachMe[${index}].whyUsed`, { min: teachLimits.detailMin, max: teachLimits.detailMax });
    assertText(entry.whyPreferred, `teachMe[${index}].whyPreferred`, { min: teachLimits.detailMin, max: teachLimits.detailMax });
    const normalized = concept.trim().toLowerCase();
    if (concepts.has(normalized)) throw new Error(`Duplicate teachMe concept: ${concept}`);
    concepts.add(normalized);
  }
  const challengePoints = assertUniqueTextList(result.reviewerChallengePoints, "reviewerChallengePoints", PLAN_V2_LIMITS.reviewerChallengePoints);
  if (challengePoints.some((item) => /^(?:none|n\/?a|not applicable|no (?:material )?(?:challenge|concern)s?)[.!]?$/i.test(item.trim()))) {
    throw new Error("reviewerChallengePoints must not contain generic filler.");
  }
  assertText(result.machineImplementationDetails, "machineImplementationDetails", PLAN_V2_LIMITS.machineImplementationDetails);
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
  const envelope = validateSplitEnvelope({
    version: SPLIT_ENVELOPE_VERSION,
    digest,
    children: normalizeSplitChildren(result.children),
  });
  const payload = Buffer.from(stableJson(envelope), "utf8").toString("base64url");
  const marker = `${SPLIT_PROPOSAL_PREFIX}${payload} -->`;
  validatePlanningCommentComponent("machine payload", marker, PLANNING_COMMENT_BUDGETS.machineBytes);
  return marker;
}

export function decodeSplitProposal(comment) {
  const start = comment.indexOf(SPLIT_PROPOSAL_PREFIX);
  if (start < 0) return null;
  if (comment.indexOf(SPLIT_PROPOSAL_PREFIX, start + SPLIT_PROPOSAL_PREFIX.length) >= 0) {
    throw new Error("Multiple split proposal markers require human review.");
  }
  const encodedStart = start + SPLIT_PROPOSAL_PREFIX.length;
  const end = comment.indexOf(" -->", encodedStart);
  if (end < 0) throw new Error("Split proposal marker is malformed.");
  const encoded = comment.slice(encodedStart, end);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("Split proposal payload is malformed.");
  let parsed;
  try {
    const decoded = Buffer.from(encoded, "base64url");
    if (decoded.toString("base64url") !== encoded) throw new Error("Non-canonical Base64URL.");
    parsed = JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new Error("Split proposal payload is malformed.");
  }
  if (parsed.version !== undefined) {
    validateSplitEnvelope(parsed);
    return { digest: parsed.digest, children: normalizeSplitChildren(parsed.children) };
  }

  assertExactKeys(parsed, ["digest", "result"], "Legacy split proposal");
  if (!/^[a-f0-9]{64}$/.test(parsed.digest ?? "")) throw new Error("Split proposal fingerprint is invalid.");
  validatePlanningResultForContract(parsed.result);
  if (parsed.result.classification !== "split-required") throw new Error("Embedded proposal is not split-required.");
  return { digest: parsed.digest, children: normalizeSplitChildren(parsed.result.children) };
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

export function validatePlanningCommentComponent(name, value, maxBytes) {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes > maxBytes) {
    throw new Error(`Planning comment ${name} is ${bytes} bytes; limit is ${maxBytes} bytes.`);
  }
  return bytes;
}

export function composePlanningComment({ automationMarker, heading, result }) {
  validatePlanningResultV2(result);
  const visible = `${heading}\n\n${renderPlanningResultV2(result)}`;
  const machine = result.classification === "split-required"
    ? encodeSplitProposal(result, automationMarker.match(/:([a-f0-9]{64}) -->$/)?.[1])
    : "";
  const framing = `${automationMarker}${machine ? "\n" : ""}\n`;
  validatePlanningCommentComponent("visible Markdown", visible, PLANNING_COMMENT_BUDGETS.visibleBytes);
  if (machine) validatePlanningCommentComponent("machine payload", machine, PLANNING_COMMENT_BUDGETS.machineBytes);
  validatePlanningCommentComponent("framing", framing, PLANNING_COMMENT_BUDGETS.framingBytes);
  const body = `${automationMarker}${machine ? `\n${machine}` : ""}\n${visible}`;
  validatePlanningCommentComponent("combined body", body, PLANNING_COMMENT_BUDGETS.combinedBytes);
  validatePublicText(body);
  return body;
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
      return { action: "run", digest: proposal.digest, source: proposal.children };
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
    if (!proposal.children.some((candidate) => candidate.id === childId)) {
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
