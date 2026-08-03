import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const USAGE_SCHEMA_VERSION = "ai-usage/v1";
export const USAGE_MARKER_PREFIX = "<!-- codex-usage:v1:";

const MAX_REQUEST_BYTES = 128 * 1024;
const TOKEN_FIELDS = [
  "input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
];
const OTLP_TOKEN_ATTRIBUTES = {
  "gen_ai.usage.input_tokens": "input_tokens",
  "gen_ai.usage.cached_input_tokens": "cached_input_tokens",
  "gen_ai.usage.output_tokens": "output_tokens",
  "gen_ai.usage.reasoning_output_tokens": "reasoning_output_tokens",
};
const OTLP_ALLOWED_ATTRIBUTES = new Set([
  "gen_ai.request.model",
  ...Object.keys(OTLP_TOKEN_ATTRIBUTES),
]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableToken(value, name) {
  if (value === null) return value;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer or null.`);
  }
  return value;
}

function stringValue(value) {
  if (!isPlainObject(value) || typeof value.stringValue !== "string") return null;
  return value.stringValue;
}

function integerValue(value) {
  if (!isPlainObject(value)) return null;
  const candidate = value.intValue ?? value.doubleValue;
  if (typeof candidate === "string" && /^\d+$/.test(candidate)) return Number(candidate);
  if (typeof candidate === "number" && Number.isSafeInteger(candidate)) return candidate;
  return null;
}

function responseRecords(payload) {
  if (!isPlainObject(payload) || !Array.isArray(payload.resourceLogs)) {
    throw new Error("OTLP logs payload is malformed.");
  }
  return payload.resourceLogs.flatMap((resourceLog) => {
    if (!isPlainObject(resourceLog) || !Array.isArray(resourceLog.scopeLogs)) {
      throw new Error("OTLP resource log is malformed.");
    }
    return resourceLog.scopeLogs.flatMap((scopeLog) => {
      if (!isPlainObject(scopeLog) || !Array.isArray(scopeLog.logRecords)) {
        throw new Error("OTLP scope log is malformed.");
      }
      return scopeLog.logRecords.filter((record) => stringValue(record?.body) === "codex.response.completed");
    });
  });
}

function parseResponseRecord(record) {
  if (!isPlainObject(record) || !Array.isArray(record.attributes)) {
    throw new Error("Codex response event is malformed.");
  }
  const usage = Object.fromEntries(TOKEN_FIELDS.map((field) => [field, null]));
  let model = null;
  const seen = new Set();
  for (const attribute of record.attributes) {
    if (!isPlainObject(attribute) || typeof attribute.key !== "string" || !OTLP_ALLOWED_ATTRIBUTES.has(attribute.key)) {
      throw new Error("Codex response event contains an unsupported attribute.");
    }
    if (seen.has(attribute.key)) throw new Error("Codex response event contains duplicate attributes.");
    seen.add(attribute.key);
    if (attribute.key === "gen_ai.request.model") {
      model = stringValue(attribute.value);
      if (!model) throw new Error("Codex response event model is malformed.");
      continue;
    }
    const token = integerValue(attribute.value);
    if (!Number.isSafeInteger(token) || token < 0) throw new Error("Codex response event token count is malformed.");
    usage[OTLP_TOKEN_ATTRIBUTES[attribute.key]] = token;
  }
  if (!model) throw new Error("Codex response event model is required.");
  return { model, usage };
}

export function collectUsageFromOtlp(payload) {
  const records = responseRecords(payload);
  if (records.length === 0) return null;
  const parsed = records.map(parseResponseRecord);
  const models = new Set(parsed.map((record) => record.model));
  if (models.size !== 1) throw new Error("Codex response events disagree on the model.");
  return {
    model: parsed[0].model,
    usage: Object.fromEntries(TOKEN_FIELDS.map((field) => {
      const values = parsed.map((record) => record.usage[field]).filter((value) => value !== null);
      return [field, values.length === 0 ? null : values.reduce((total, value) => total + value, 0)];
    })),
  };
}

export function usageEventId({ repository, workflowRunId, workflowRunAttempt, stage }) {
  return createHash("sha256")
    .update(stableJson({ repository, workflowRunId, workflowRunAttempt, stage }))
    .digest("hex");
}

export function usageMarker(event) {
  return `${USAGE_MARKER_PREFIX}${event.event_id} -->`;
}

export function buildUsageEvent(metadata, measurement = null) {
  const captured = isPlainObject(measurement) && isPlainObject(measurement.usage) &&
    TOKEN_FIELDS.every((field) => measurement.usage[field] === null || (
      Number.isSafeInteger(measurement.usage[field]) && measurement.usage[field] >= 0
    ))
    ? measurement
    : null;
  const event = {
    schema_version: USAGE_SCHEMA_VERSION,
    event_id: usageEventId(metadata),
    occurred_at: metadata.occurredAt,
    source: "codex-label-automation",
    provider: "openai",
    repository: metadata.repository,
    issue_number: metadata.issueNumber,
    workflow: metadata.workflow,
    stage: metadata.stage,
    model: metadata.model,
    reasoning_effort: metadata.reasoningEffort,
    workflow_run_id: metadata.workflowRunId,
    workflow_run_attempt: metadata.workflowRunAttempt,
    outcome: metadata.outcome,
    measurement_status: captured ? "captured" : "unavailable",
    input_tokens: captured?.usage.input_tokens ?? null,
    cached_input_tokens: captured?.usage.cached_input_tokens ?? null,
    output_tokens: captured?.usage.output_tokens ?? null,
    reasoning_output_tokens: captured?.usage.reasoning_output_tokens ?? null,
    duration_ms: metadata.durationMs,
    run_url: metadata.runUrl,
  };
  return validateUsageEvent(event);
}

export function validateUsageEvent(event) {
  const expected = new Set([
    "schema_version", "event_id", "occurred_at", "source", "provider", "repository", "issue_number", "workflow",
    "stage", "model", "reasoning_effort", "workflow_run_id", "workflow_run_attempt", "outcome", "measurement_status",
    ...TOKEN_FIELDS, "duration_ms", "run_url",
  ]);
  if (!isPlainObject(event) || Object.keys(event).length !== expected.size || Object.keys(event).some((key) => !expected.has(key))) {
    throw new Error("Usage event must contain only the ai-usage/v1 allowlist.");
  }
  if (event.schema_version !== USAGE_SCHEMA_VERSION || !/^[a-f0-9]{64}$/.test(event.event_id ?? "")) {
    throw new Error("Usage event identity is invalid.");
  }
  const occurredAt = new Date(event.occurred_at);
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString() !== event.occurred_at) throw new Error("Usage event timestamp is invalid.");
  if (event.source !== "codex-label-automation" || event.provider !== "openai") throw new Error("Usage event source is invalid.");
  if (typeof event.repository !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(event.repository)) throw new Error("Usage event repository is invalid.");
  if (!Number.isSafeInteger(event.issue_number) || event.issue_number < 1) throw new Error("Usage event issue number is invalid.");
  if (typeof event.workflow !== "string" || event.workflow.length < 1 || event.workflow.length > 200) throw new Error("Usage event workflow is invalid.");
  if (!new Set(["plan", "revise", "implement"]).has(event.stage)) throw new Error("Usage event stage is invalid.");
  if (typeof event.model !== "string" || event.model.length < 1 || event.model.length > 100) throw new Error("Usage event model is invalid.");
  if (!new Set(["low", "medium"]).has(event.reasoning_effort)) throw new Error("Usage event reasoning effort is invalid.");
  if (!Number.isSafeInteger(event.workflow_run_id) || event.workflow_run_id < 1 || !Number.isSafeInteger(event.workflow_run_attempt) || event.workflow_run_attempt < 1) throw new Error("Usage event run identity is invalid.");
  if (event.event_id !== usageEventId({
    repository: event.repository,
    workflowRunId: event.workflow_run_id,
    workflowRunAttempt: event.workflow_run_attempt,
    stage: event.stage,
  })) throw new Error("Usage event marker identity is invalid.");
  if (!new Set(["success", "failure"]).has(event.outcome) || !new Set(["captured", "unavailable"]).has(event.measurement_status)) throw new Error("Usage event status is invalid.");
  for (const field of TOKEN_FIELDS) nullableToken(event[field], field);
  if (event.measurement_status === "unavailable" && TOKEN_FIELDS.some((field) => event[field] !== null)) throw new Error("Unavailable usage events must not contain token counts.");
  if (!Number.isSafeInteger(event.duration_ms) || event.duration_ms < 0) throw new Error("Usage event duration is invalid.");
  if (typeof event.run_url !== "string" || !/^https:\/\/[^\s]+\/[^\s]+\/actions\/runs\/\d+$/.test(event.run_url)) throw new Error("Usage event run URL is invalid.");
  return event;
}

export function renderUsageComment(event) {
  validateUsageEvent(event);
  const tokens = TOKEN_FIELDS.map((field) => `${field}: ${event[field] ?? "unavailable"}`).join("; ");
  return `${usageMarker(event)}\n## Codex usage record\n\n` +
    `Stage: \`${event.stage}\` · Model: \`${event.model}\` · Effort: \`${event.reasoning_effort}\` · Outcome: \`${event.outcome}\` · Measurement: \`${event.measurement_status}\`\n\n` +
    `Duration: ${event.duration_ms} ms · [Workflow run](${event.run_url})\n\n` +
    `Token counts — ${tokens}\n\n` +
    `\`\`\`json\n${JSON.stringify(event)}\n\`\`\``;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function startUsageReceiver({ host = "127.0.0.1", port = 0 } = {}) {
  let measurement = null;
  let invalid = false;
  const server = createServer((request, response) => {
    if (request.method !== "POST" || !["/", "/v1/logs"].includes(request.url)) {
      response.writeHead(404).end();
      return;
    }
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_REQUEST_BYTES) chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > MAX_REQUEST_BYTES) {
        invalid = true;
        response.writeHead(413).end();
        return;
      }
      try {
        const captured = collectUsageFromOtlp(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        if (captured) {
          if (measurement) throw new Error("A usage measurement was already captured.");
          measurement = captured;
        }
        response.writeHead(200, { "content-type": "application/json" }).end("{}");
      } catch {
        invalid = true;
        response.writeHead(400).end();
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve({
        port: server.address().port,
        close: () => new Promise((done) => server.close(() => done(invalid ? null : measurement))),
      });
    });
  });
}

async function receiveCommand(listenerPath, measurementPath) {
  const receiver = await startUsageReceiver();
  writeJson(listenerPath, { port: receiver.port });
  const stop = async () => {
    const measurement = await receiver.close();
    writeJson(measurementPath, measurement);
    process.exit(0);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

function eventCommand(metadataPath, measurementPath, outputPath) {
  const metadata = readJson(metadataPath);
  if (!metadata) throw new Error("Usage metadata is unavailable.");
  const measurement = readJson(measurementPath);
  const event = buildUsageEvent(metadata, measurement);
  writeJson(outputPath, event);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "receive" && args.length === 2) {
    receiveCommand(args[0], args[1]).catch(() => process.exit(1));
  } else if (command === "event" && args.length === 3) {
    eventCommand(args[0], args[1], args[2]);
  } else {
    process.exitCode = 1;
  }
}
