import { describe, expect, it } from "vitest";

import {
  buildUsageEvent,
  collectUsageFromOtlp,
  renderUsageComment,
  startUsageReceiver,
  usageMarker,
  validateUsageEvent,
} from "./codex-usage-telemetry.mjs";

const metadata = {
  repository: "owner/private-repository",
  issueNumber: 90,
  workflow: "Codex label automation",
  stage: "implement",
  model: "gpt-5.6-terra",
  reasoningEffort: "medium",
  workflowRunId: 123456,
  workflowRunAttempt: 2,
  outcome: "success",
  durationMs: 4200,
  runUrl: "https://github.com/owner/private-repository/actions/runs/123456",
  occurredAt: "2026-08-03T02:04:08.000Z",
};

function completedResponse(attributes = []) {
  return {
    resourceLogs: [{
      scopeLogs: [{
        logRecords: [{
          body: { stringValue: "codex.response.completed" },
          attributes,
        }],
      }],
    }],
  };
}

function attribute(key, value) {
  return { key, value: typeof value === "string" ? { stringValue: value } : { intValue: String(value) } };
}

describe("Codex usage telemetry", () => {
  it("captures only the pinned completed-response attributes", () => {
    expect(collectUsageFromOtlp(completedResponse([
      attribute("gen_ai.request.model", "gpt-5.6-terra"),
      attribute("gen_ai.usage.input_tokens", 100),
      attribute("gen_ai.usage.cached_input_tokens", 20),
      attribute("gen_ai.usage.output_tokens", 40),
      attribute("gen_ai.usage.reasoning_output_tokens", 10),
    ]))).toEqual({
      model: "gpt-5.6-terra",
      usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 40, reasoning_output_tokens: 10 },
    });
  });

  it("fails closed for unknown or malformed response telemetry", () => {
    expect(() => collectUsageFromOtlp(completedResponse([
      attribute("gen_ai.request.model", "gpt-5.6-terra"),
      attribute("gen_ai.usage.input_tokens", 100),
      attribute("unexpected.prompt", "must never be retained"),
    ]))).toThrow(/unsupported/);
    expect(() => collectUsageFromOtlp(completedResponse([
      attribute("gen_ai.request.model", "gpt-5.6-terra"),
      { key: "gen_ai.usage.input_tokens", value: { stringValue: "100" } },
    ]))).toThrow(/malformed/);
    expect(() => collectUsageFromOtlp({ resourceLogs: [] })).not.toThrow();
    expect(collectUsageFromOtlp({ resourceLogs: [] })).toBeNull();
  });

  it("uses nullable counts when telemetry is missing and never derives a price or total", () => {
    const event = buildUsageEvent(metadata);
    expect(event).toMatchObject({
      schema_version: "ai-usage/v1",
      measurement_status: "unavailable",
      input_tokens: null,
      cached_input_tokens: null,
      output_tokens: null,
      reasoning_output_tokens: null,
    });
    expect(Object.keys(event)).not.toContain("usd");
    expect(renderUsageComment(event)).toContain(usageMarker(event));
    expect(buildUsageEvent(metadata, { unexpected: true }).measurement_status).toBe("unavailable");
  });

  it("rejects an event with an altered deterministic identity or unavailable counts", () => {
    const event = buildUsageEvent(metadata);
    expect(() => validateUsageEvent({ ...event, event_id: "a".repeat(64) })).toThrow(/identity/);
    expect(() => validateUsageEvent({ ...event, input_tokens: 1 })).toThrow(/Unavailable/);
  });

  it("keeps the loopback receiver in memory and returns unavailable after invalid input", async () => {
    const receiver = await startUsageReceiver();
    const response = await fetch(`http://127.0.0.1:${receiver.port}/v1/logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(completedResponse([attribute("unknown", "value")])),
    });
    expect(response.status).toBe(400);
    expect(await receiver.close()).toBeNull();
  });
});
