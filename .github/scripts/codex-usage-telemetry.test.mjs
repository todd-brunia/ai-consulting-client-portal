import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";

import {
  buildUsageEvent,
  collectUsageFromOtlp,
  finalizeUsageReceiver,
  renderUsageComment,
  startUsageReceiver,
  usageMarker,
  validateTerminalResult,
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

function terminal(measurement) {
  return {
    schema_version: "codex-usage-terminal/v1",
    status: "captured",
    reason: null,
    measurement,
  };
}

async function waitForJson(path, timeoutMs = 2000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
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

  it("parses the sanitized fixture captured for the pinned CLI contract", () => {
    const fixture = JSON.parse(readFileSync(".github/fixtures/codex-usage/response-completed.json", "utf8"));
    expect(collectUsageFromOtlp(fixture)).toEqual({
      model: "gpt-5.6-luna",
      usage: { input_tokens: 120, cached_input_tokens: 30, output_tokens: 40, reasoning_output_tokens: 10 },
    });
  });

  it("aggregates completed responses across batches and requests", async () => {
    const receiver = await startUsageReceiver();
    for (const input of [10, 15]) {
      const response = await fetch(`http://127.0.0.1:${receiver.port}/v1/logs`, {
        method: "POST",
        body: JSON.stringify(completedResponse([
          attribute("gen_ai.request.model", "gpt-5.6-luna"),
          attribute("gen_ai.usage.input_tokens", input),
        ])),
      });
      expect(response.status).toBe(200);
    }
    expect(await receiver.close()).toEqual(terminal({
      model: "gpt-5.6-luna",
      usage: { input_tokens: 25, cached_input_tokens: null, output_tokens: null, reasoning_output_tokens: null },
    }));
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
      measurement_reason: "receiver_start_failed",
      input_tokens: null,
      cached_input_tokens: null,
      output_tokens: null,
      reasoning_output_tokens: null,
    });
    expect(Object.keys(event)).not.toContain("usd");
    expect(renderUsageComment(event)).toContain(usageMarker(event));
    expect(buildUsageEvent(metadata, { unexpected: true }).measurement_reason).toBe("invalid_terminal_result");
  });

  it("includes captured counts without an unavailable reason", () => {
    const event = buildUsageEvent(metadata, terminal({
      model: "gpt-5.6-terra",
      usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 40, reasoning_output_tokens: 10 },
    }));
    expect(event).toMatchObject({ measurement_status: "captured", measurement_reason: null, input_tokens: 100 });
  });

  it("rejects an event with an altered deterministic identity or unavailable counts", () => {
    const event = buildUsageEvent(metadata);
    expect(() => validateUsageEvent({ ...event, event_id: "a".repeat(64) })).toThrow(/identity/);
    expect(() => validateUsageEvent({ ...event, input_tokens: 1 })).toThrow(/Unavailable/);
    expect(() => validateUsageEvent({ ...event, measurement_reason: "raw parser error" })).toThrow(/Unavailable/);
  });

  it("keeps the loopback receiver in memory and returns unavailable after invalid input", async () => {
    const receiver = await startUsageReceiver();
    const response = await fetch(`http://127.0.0.1:${receiver.port}/v1/logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(completedResponse([attribute("unknown", "value")])),
    });
    expect(response.status).toBe(400);
    expect(await receiver.close()).toMatchObject({ status: "unavailable", reason: "rejected_telemetry" });
  });

  it("reports no completed response separately from rejected telemetry", async () => {
    const receiver = await startUsageReceiver();
    const response = await fetch(`http://127.0.0.1:${receiver.port}/v1/logs`, {
      method: "POST",
      body: JSON.stringify({ resourceLogs: [] }),
    });
    expect(response.status).toBe(200);
    expect(await receiver.close()).toMatchObject({ status: "unavailable", reason: "no_completed_response" });
  });

  it("drains an accepted in-flight request before acknowledging shutdown", async () => {
    const receiver = await startUsageReceiver();
    const body = JSON.stringify(completedResponse([
      attribute("gen_ai.request.model", "gpt-5.6-luna"),
      attribute("gen_ai.usage.output_tokens", 17),
    ]));
    const responseFinished = new Promise((resolve, reject) => {
      const request = httpRequest({
        host: "127.0.0.1",
        port: receiver.port,
        path: "/v1/logs",
        method: "POST",
        headers: { "content-length": Buffer.byteLength(body) },
      }, (response) => {
        response.resume();
        response.once("end", resolve);
      });
      request.once("error", reject);
      request.write(body.slice(0, 10));
      setTimeout(() => request.end(body.slice(10)), 30);
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const closing = receiver.close();
    await responseFinished;
    expect(await closing).toMatchObject({
      status: "captured",
      measurement: { usage: { output_tokens: 17 } },
    });
  });

  it("uses bounded, sanitized fail-open results for startup failure and timeout", async () => {
    const directory = mkdtempSync(join(tmpdir(), "codex-usage-finalize-"));
    const startup = await finalizeUsageReceiver({
      listenerPath: join(directory, "missing-listener.json"),
      stopPath: join(directory, "stop.json"),
      terminalResultPath: join(directory, "terminal.json"),
      outputPath: join(directory, "startup.json"),
      timeoutMs: 25,
      pollMs: 5,
    });
    expect(startup.reason).toBe("receiver_start_failed");

    const listenerPath = join(directory, "listener.json");
    writeFileSync(listenerPath, '{"port":1234}\n');
    const timedOut = await finalizeUsageReceiver({
      listenerPath,
      stopPath: join(directory, "timeout-stop.json"),
      terminalResultPath: join(directory, "missing-terminal.json"),
      outputPath: join(directory, "timeout.json"),
      timeoutMs: 25,
      pollMs: 5,
    });
    expect(timedOut.reason).toBe("finalization_timeout");
  });

  it("coordinates independent receiver and finalizer processes and is idempotent", async () => {
    const directory = mkdtempSync(join(tmpdir(), "codex-usage-process-"));
    const listenerPath = join(directory, "listener.json");
    const terminalPath = join(directory, "terminal.json");
    const stopPath = join(directory, "stop.json");
    const outputPath = join(directory, "output.json");
    const receiver = spawn(process.execPath, [
      ".github/scripts/codex-usage-telemetry.mjs", "receive", listenerPath, terminalPath, stopPath,
    ], { stdio: "ignore" });
    const listener = await waitForJson(listenerPath);
    const response = await fetch(`http://127.0.0.1:${listener.port}/v1/logs`, {
      method: "POST",
      body: JSON.stringify(completedResponse([
        attribute("gen_ai.request.model", "gpt-5.6-luna"),
        attribute("gen_ai.usage.input_tokens", 42),
      ])),
    });
    expect(response.status).toBe(200);
    const first = await finalizeUsageReceiver({ listenerPath, stopPath, terminalResultPath: terminalPath, outputPath });
    const second = await finalizeUsageReceiver({ listenerPath, stopPath, terminalResultPath: terminalPath, outputPath });
    expect(second).toEqual(first);
    expect(first).toMatchObject({ status: "captured", measurement: { usage: { input_tokens: 42 } } });
    expect(validateTerminalResult(JSON.parse(readFileSync(outputPath, "utf8")))).toEqual(first);
    if (receiver.exitCode === null) await new Promise((resolve) => receiver.once("exit", resolve));
  }, 10_000);
});
