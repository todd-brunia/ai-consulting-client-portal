import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  MachinePrincipal,
} from "./authorization";
import {
  emitMachineRequestAudit,
  type MachineRequestAuditEvent,
  type MachineRequestAuditInput,
} from "./machine-request-audit";

const timestamp = new Date("2026-07-24T12:00:00.000Z");
const integrationId = "11111111-1111-4111-8111-111111111111";

function machineContext(): MachinePrincipal {
  return {
    kind: "machine",
    integrationId,
    capabilities: ["engagements:read"],
    grants: {
      organizationIds: ["organization-1"],
      engagementIds: ["engagement-1"],
    },
  };
}

function captureEvent(input: MachineRequestAuditInput) {
  const write = vi.fn<(event: MachineRequestAuditEvent) => void>();
  const emitted = emitMachineRequestAudit(input, {
    now: () => timestamp,
    write,
  });
  return { emitted, write };
}

describe("emitMachineRequestAudit", () => {
  it.each(["success", "rejected"] as const)(
    "emits allowlisted metadata for a known machine %s",
    (result) => {
      const { emitted, write } = captureEvent({
        context: machineContext(),
        requestCategory: "engagements.read",
        result,
      });

      expect(emitted).toBe(true);
      expect(write).toHaveBeenCalledWith({
        event: "machine_request",
        principal: { kind: "machine", integrationId },
        requestCategory: "engagements.read",
        result,
        timestamp: timestamp.toISOString(),
      });
    },
  );

  it.each([
    ["unknown", null],
    [
      "human",
      {
        kind: "human",
        identity: { userId: "human-1" },
      } satisfies AuthorizationContext,
    ],
  ])("does not emit for an %s principal", (_, context) => {
    const { emitted, write } = captureEvent({
      context,
      requestCategory: "engagements.read",
      result: "rejected",
    });

    expect(emitted).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("drops nested and unexpected sensitive fields through allowlisting", () => {
    const sensitiveValues = {
      apiKey: "portal_agent_lookup_complete-secret",
      authorization: "Bearer complete-secret",
      verificationMaterial: "scrypt-hash",
      serviceRoleKey: "service-role-secret",
      clientContent: "private client message",
    };
    const context = {
      ...machineContext(),
      authorizationHeader: sensitiveValues.authorization,
      credential: {
        apiKey: sensitiveValues.apiKey,
        verification: {
          hash: sensitiveValues.verificationMaterial,
        },
      },
      provider: {
        serviceRoleKey: sensitiveValues.serviceRoleKey,
      },
      request: {
        body: {
          content: sensitiveValues.clientContent,
        },
      },
    } as MachinePrincipal;
    const input = {
      context,
      requestCategory: "engagements.read",
      result: "success",
      unexpected: {
        bearer: sensitiveValues.authorization,
      },
    } as MachineRequestAuditInput;

    const { write } = captureEvent(input);
    const serializedEvent = JSON.stringify(write.mock.calls[0]?.[0]);

    for (const sensitiveValue of Object.values(sensitiveValues)) {
      expect(serializedEvent).not.toContain(sensitiveValue);
    }
    expect(serializedEvent).not.toContain("organization-1");
    expect(serializedEvent).not.toContain("engagement-1");
  });

  it("ignores unexpected category and result values at runtime", () => {
    const write = vi.fn();

    expect(
      emitMachineRequestAudit(
        {
          context: machineContext(),
          requestCategory: "request-body" as "engagements.read",
          result: "Bearer secret" as "success",
        },
        { write },
      ),
    ).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("does not let an audit sink failure change request handling", () => {
    expect(() =>
      emitMachineRequestAudit(
        {
          context: machineContext(),
          requestCategory: "engagements.read",
          result: "success",
        },
        {
          write: () => {
            throw new Error("sink details");
          },
        },
      ),
    ).not.toThrow();
  });
});
