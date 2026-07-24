import { createClient } from "@supabase/supabase-js";
import {
  SignJWT,
  importJWK,
  jwtVerify,
  type JWK,
} from "jose";
import type { MachinePrincipal } from "./authorization";
import type { VisibleEngagement } from "@/lib/engagements/service";

export const machineJwtAlgorithm = "ES256";
export const machineJwtIssuer = "ai-consulting-client-portal";
export const machineJwtAudience = "supabase-data-api";
export const machineDatabaseRole = "portal_machine";
export const machineJwtLifetimeSeconds = 60;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const forbiddenClaimNames = [
  "capabilities",
  "organization_ids",
  "organizationIds",
  "engagement_ids",
  "engagementIds",
  "scope",
] as const;

export type MachineJwtSigningConfig = {
  privateJwk: JWK;
};

export type MachineJwtVerificationConfig = {
  publicJwk: JWK;
};

export type MachineDatabaseDependencies = {
  now?: () => Date;
  signingConfig?: MachineJwtSigningConfig;
  supabaseUrl?: string;
  publishableKey?: string;
  createSupabaseClient?: typeof createClient;
};

export type MachineEngagementReadResult =
  | {
      status: "success";
      engagements: VisibleEngagement[];
    }
  | { status: "query_failed" };

function requireMachinePrincipal(
  principal: MachinePrincipal,
): MachinePrincipal {
  if (
    principal.kind !== "machine" ||
    !uuidPattern.test(principal.integrationId)
  ) {
    throw new Error("A valid machine principal is required");
  }

  return principal;
}

function validatePrivateJwk(jwk: JWK): asserts jwk is JWK & {
  kid: string;
  d: string;
} {
  if (
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    jwk.alg !== machineJwtAlgorithm ||
    typeof jwk.kid !== "string" ||
    !jwk.kid ||
    typeof jwk.d !== "string" ||
    !jwk.d
  ) {
    throw new Error("A private ES256 machine JWT signing JWK is required");
  }
}

function readSigningConfig(): MachineJwtSigningConfig {
  const encoded = process.env.MACHINE_JWT_PRIVATE_JWK;
  if (!encoded) {
    throw new Error("Machine JWT signing is not configured");
  }

  try {
    const privateJwk = JSON.parse(encoded) as JWK;
    validatePrivateJwk(privateJwk);
    return { privateJwk };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "A private ES256 machine JWT signing JWK is required"
    ) {
      throw error;
    }
    throw new Error("Machine JWT signing configuration is invalid");
  }
}

async function importPrivateKey(
  jwk: JWK,
): Promise<CryptoKey | Uint8Array> {
  validatePrivateJwk(jwk);
  return importJWK(
    { ...jwk, key_ops: ["sign"] },
    machineJwtAlgorithm,
  );
}

export async function mintMachineDatabaseToken(
  principal: MachinePrincipal,
  config: MachineJwtSigningConfig,
  now = new Date(),
): Promise<string> {
  const trustedPrincipal = requireMachinePrincipal(principal);
  const key = await importPrivateKey(config.privateJwk);
  const issuedAt = Math.floor(now.getTime() / 1000);

  return new SignJWT({
    role: machineDatabaseRole,
    machine_integration_id: trustedPrincipal.integrationId,
  })
    .setProtectedHeader({
      alg: machineJwtAlgorithm,
      kid: config.privateJwk.kid,
      typ: "JWT",
    })
    .setIssuer(machineJwtIssuer)
    .setAudience(machineJwtAudience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + machineJwtLifetimeSeconds)
    .sign(key);
}

export async function verifyMachineDatabaseToken(
  token: string,
  config: MachineJwtVerificationConfig,
  now = new Date(),
): Promise<{ integrationId: string }> {
  const key = await importJWK(config.publicJwk, machineJwtAlgorithm);
  const { payload, protectedHeader } = await jwtVerify(token, key, {
    algorithms: [machineJwtAlgorithm],
    issuer: machineJwtIssuer,
    audience: machineJwtAudience,
    currentDate: now,
    requiredClaims: [
      "iat",
      "exp",
      "role",
      "machine_integration_id",
    ],
  });

  if (
    protectedHeader.typ !== "JWT" ||
    typeof protectedHeader.kid !== "string" ||
    protectedHeader.kid !== config.publicJwk.kid ||
    payload.role !== machineDatabaseRole ||
    typeof payload.machine_integration_id !== "string" ||
    !uuidPattern.test(payload.machine_integration_id) ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    payload.iat > Math.floor(now.getTime() / 1000) ||
    payload.exp - payload.iat !== machineJwtLifetimeSeconds ||
    forbiddenClaimNames.some((claim) => payload[claim] !== undefined)
  ) {
    throw new Error("Machine database token claims are invalid");
  }

  return { integrationId: payload.machine_integration_id };
}

export async function loadMachineVisibleEngagements(
  principal: MachinePrincipal,
  dependencies: MachineDatabaseDependencies = {},
): Promise<MachineEngagementReadResult> {
  requireMachinePrincipal(principal);
  const signingConfig =
    dependencies.signingConfig ?? readSigningConfig();
  const token = await mintMachineDatabaseToken(
    principal,
    signingConfig,
    dependencies.now?.() ?? new Date(),
  );
  const supabaseUrl =
    dependencies.supabaseUrl ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    dependencies.publishableKey ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase machine database access is not configured");
  }

  const clientFactory =
    dependencies.createSupabaseClient ?? createClient;
  const supabase = clientFactory(supabaseUrl, publishableKey, {
    accessToken: async () => token,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase
    .from("engagements")
    .select(
      "id, organization_id, name, status, created_at, organizations(name)",
    )
    .order("created_at", { ascending: false });

  if (error || !data) {
    return { status: "query_failed" };
  }

  return {
    status: "success",
    engagements: data as VisibleEngagement[],
  };
}
