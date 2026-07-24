import type { AuthorizationContext } from "./authorization";

export const machineRequestCategories = ["engagements.read"] as const;
export const machineRequestResults = ["success", "rejected"] as const;

export type MachineRequestCategory =
  (typeof machineRequestCategories)[number];
export type MachineRequestResult =
  (typeof machineRequestResults)[number];

export type MachineRequestAuditEvent = {
  event: "machine_request";
  principal: {
    kind: "machine";
    integrationId: string;
  };
  requestCategory: MachineRequestCategory;
  result: MachineRequestResult;
  timestamp: string;
};

export type MachineRequestAuditInput = {
  context: AuthorizationContext | null;
  requestCategory: MachineRequestCategory;
  result: MachineRequestResult;
};

export type MachineRequestAuditDependencies = {
  now?: () => Date;
  write?: (event: MachineRequestAuditEvent) => void;
};

function isMachineRequestCategory(
  value: unknown,
): value is MachineRequestCategory {
  return machineRequestCategories.includes(
    value as MachineRequestCategory,
  );
}

function isMachineRequestResult(
  value: unknown,
): value is MachineRequestResult {
  return machineRequestResults.includes(value as MachineRequestResult);
}

function writeServerAuditEvent(event: MachineRequestAuditEvent) {
  console.info("[machine-request-audit]", event);
}

export function emitMachineRequestAudit(
  input: MachineRequestAuditInput,
  dependencies: MachineRequestAuditDependencies = {},
): boolean {
  const { context, requestCategory, result } = input;
  if (
    context?.kind !== "machine" ||
    !isMachineRequestCategory(requestCategory) ||
    !isMachineRequestResult(result)
  ) {
    return false;
  }

  const event: MachineRequestAuditEvent = {
    event: "machine_request",
    principal: {
      kind: "machine",
      integrationId: context.integrationId,
    },
    requestCategory,
    result,
    timestamp: (dependencies.now ?? (() => new Date()))().toISOString(),
  };

  try {
    (dependencies.write ?? writeServerAuditEvent)(event);
  } catch {
    // Audit output must not change the request result or surface sink details.
  }
  return true;
}
