import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import type {
  AgentCredentialMetadata,
  AgentCredentialRepository,
  AgentCredentialVerificationRepository,
} from "./types";

const keyPrefix = "portal_agent";
const lookupPrefixBytes = 8;
const secretBytes = 32;
const derivedKeyBytes = 32;
const scryptCost = 16_384;
const scryptBlockSize = 8;
const scryptParallelization = 1;
const scryptMaxMemory = 32 * 1024 * 1024;
const keyPattern =
  /^portal_agent_([a-f0-9]{16})_([A-Za-z0-9_-]{43})$/;

export type CredentialTransport = {
  authorizationHeader: string | null;
  queryCredential?: string | null;
  formCredential?: string | null;
  cookieCredential?: string | null;
};

export type IssueAgentCredentialInput = {
  agentIntegrationId: string;
  expiresAt: Date;
};

export type IssuedAgentCredential = {
  apiKey: string;
  credential: AgentCredentialMetadata;
};

export type VerifiedAgentCredential = {
  status: "valid";
  credentialId: string;
  agentIntegrationId: string;
};

export type VerifyAgentCredentialResult =
  | VerifiedAgentCredential
  | { status: "invalid" };

type CredentialEntropy = {
  lookupPrefix: () => string;
  secret: () => string;
  salt: () => string;
};

export type CredentialServiceDependencies = {
  now?: () => Date;
  entropy?: CredentialEntropy;
};

function defaultEntropy(): CredentialEntropy {
  return {
    lookupPrefix: () => randomBytes(lookupPrefixBytes).toString("hex"),
    secret: () => randomBytes(secretBytes).toString("base64url"),
    salt: () => randomBytes(16).toString("base64url"),
  };
}

function deriveKey(value: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      value,
      salt,
      derivedKeyBytes,
      {
        N: scryptCost,
        r: scryptBlockSize,
        p: scryptParallelization,
        maxmem: scryptMaxMemory,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

async function hashCredential(
  apiKey: string,
  salt: string,
): Promise<string> {
  const derivedKey = await deriveKey(apiKey, salt);
  return [
    "scrypt",
    scryptCost,
    scryptBlockSize,
    scryptParallelization,
    salt,
    derivedKey.toString("base64url"),
  ].join("$");
}

async function credentialMatchesHash(
  apiKey: string,
  storedHash: string,
): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, salt, encodedKey] =
    storedHash.split("$");

  if (
    algorithm !== "scrypt" ||
    cost !== String(scryptCost) ||
    blockSize !== String(scryptBlockSize) ||
    parallelization !== String(scryptParallelization) ||
    !salt ||
    !encodedKey
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(encodedKey, "base64url");
    const actual = await deriveKey(apiKey, salt);
    return (
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

function sanitizeCredential(
  credential: Awaited<
    ReturnType<AgentCredentialRepository["createCredential"]>
  >,
): AgentCredentialMetadata {
  return {
    id: credential.id,
    agentIntegrationId: credential.agentIntegrationId,
    lookupPrefix: credential.lookupPrefix,
    createdAt: credential.createdAt,
    expiresAt: credential.expiresAt,
    lastUsedAt: credential.lastUsedAt,
    revokedAt: credential.revokedAt,
  };
}

export function readBearerCredential(
  transport: CredentialTransport,
): string | null {
  if (
    transport.queryCredential ||
    transport.formCredential ||
    transport.cookieCredential
  ) {
    return null;
  }

  const match = transport.authorizationHeader?.match(
    /^Bearer ([^\s]+)$/i,
  );
  return match?.[1] ?? null;
}

export async function issueAgentCredential(
  repository: AgentCredentialRepository,
  input: IssueAgentCredentialInput,
  dependencies: CredentialServiceDependencies = {},
): Promise<IssuedAgentCredential> {
  const now = dependencies.now?.() ?? new Date();
  if (input.expiresAt <= now) {
    throw new Error("Credential expiry must be in the future");
  }

  const entropy = dependencies.entropy ?? defaultEntropy();
  const lookupPrefix = entropy.lookupPrefix();
  const apiKey = `${keyPrefix}_${lookupPrefix}_${entropy.secret()}`;
  const secretHash = await hashCredential(apiKey, entropy.salt());
  const stored = await repository.createCredential({
    agentIntegrationId: input.agentIntegrationId,
    lookupPrefix,
    secretHash,
    expiresAt: input.expiresAt,
  });

  return {
    apiKey,
    credential: sanitizeCredential(stored),
  };
}

export async function verifyAgentCredential(
  repository: AgentCredentialVerificationRepository,
  transport: CredentialTransport,
  dependencies: CredentialServiceDependencies = {},
): Promise<VerifyAgentCredentialResult> {
  const apiKey = readBearerCredential(transport);
  const parsed = apiKey?.match(keyPattern);
  if (!apiKey || !parsed) return { status: "invalid" };

  const credential = await repository.findCredentialByPrefix(parsed[1]);
  const now = dependencies.now?.() ?? new Date();
  if (
    !credential ||
    credential.revokedAt ||
    credential.expiresAt <= now ||
    !(await credentialMatchesHash(apiKey, credential.secretHash))
  ) {
    return { status: "invalid" };
  }

  await repository.recordCredentialUse(credential.id, now);
  return {
    status: "valid",
    credentialId: credential.id,
    agentIntegrationId: credential.agentIntegrationId,
  };
}
