import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NetworkObservation } from "./types";

const execFileAsync = promisify(execFile);

export type OmadaPrintingPressConfig = {
  commandPath: string;
  timeoutMs: number;
};

export type OmadaPrintingPressResult = {
  command: string[];
  count: number;
  observations: NetworkObservation[];
};

export type OmadaPrintingPressDoctorCheck = {
  detail?: string;
  name: string;
  status: "fail" | "pass" | "skip" | string;
};

export type OmadaPrintingPressDoctorResult = {
  checks: OmadaPrintingPressDoctorCheck[];
  live: boolean;
  status: "error" | "ok" | string;
};

type ObservationEnvelope = {
  observations?: unknown;
};

export function getOmadaPrintingPressConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): OmadaPrintingPressConfig {
  const commandPath = env.OMADA_PP_CLI_PATH;
  if (!commandPath) throw new Error("OMADA_PP_CLI_PATH is required");

  return {
    commandPath,
    timeoutMs: Number(env.OMADA_PP_CLI_TIMEOUT_MS ?? 15000)
  };
}

export async function listOmadaPrintingPressObservations(
  config = getOmadaPrintingPressConfigFromEnv(),
  env: NodeJS.ProcessEnv = process.env
): Promise<OmadaPrintingPressResult> {
  const args = ["whofi", "observations", "--json"];
  const childEnv = buildCliEnv(env);
  const { stdout } = await execFileAsync(config.commandPath, args, {
    env: childEnv,
    maxBuffer: 1024 * 1024,
    timeout: config.timeoutMs
  });

  const observations = parseObservations(stdout);

  return {
    command: [config.commandPath, ...args],
    count: observations.length,
    observations
  };
}

export async function doctorOmadaPrintingPress(
  config = getOmadaPrintingPressConfigFromEnv(),
  env: NodeJS.ProcessEnv = process.env
): Promise<OmadaPrintingPressDoctorResult> {
  const args = ["whofi", "doctor", "--live"];
  const childEnv = buildCliEnv(env);

  let stdout = "";
  try {
    const result = await execFileAsync(config.commandPath, args, {
      env: childEnv,
      maxBuffer: 1024 * 1024,
      timeout: config.timeoutMs
    });
    stdout = result.stdout;
  } catch (error) {
    stdout = readExecStdout(error);
    if (!stdout) throw error;
  }

  return parseDoctor(stdout);
}

function buildCliEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    OMADA_ESSENTIAL_BASE_URL: env.OMADA_ESSENTIAL_BASE_URL ?? env.OMADA_API_BASE_URL,
    OMADA_ESSENTIAL_CLOUD_PORTAL_URL: env.OMADA_ESSENTIAL_CLOUD_PORTAL_URL ?? env.OMADA_CLOUD_PORTAL_URL,
    OMADA_ESSENTIAL_CONTROLLER_ID: env.OMADA_ESSENTIAL_CONTROLLER_ID ?? env.OMADA_CONTROLLER_ID,
    OMADA_ESSENTIAL_PASSWORD: env.OMADA_ESSENTIAL_PASSWORD ?? env.OMADA_PASSWORD,
    OMADA_ESSENTIAL_SITE_ID: env.OMADA_ESSENTIAL_SITE_ID ?? env.OMADA_SITE_ID,
    OMADA_ESSENTIAL_SITE_NAME: env.OMADA_ESSENTIAL_SITE_NAME ?? env.OMADA_SITE_NAME,
    OMADA_ESSENTIAL_USERNAME: env.OMADA_ESSENTIAL_USERNAME ?? env.OMADA_USERNAME
  };
}

function parseDoctor(stdout: string): OmadaPrintingPressDoctorResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("Omada Printing Press doctor returned non-JSON output");
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.checks) || typeof parsed.status !== "string") {
    throw new Error("Omada Printing Press doctor returned an unexpected output shape");
  }

  return {
    checks: parsed.checks.map(normalizeDoctorCheck),
    live: typeof parsed.live === "boolean" ? parsed.live : false,
    status: parsed.status
  };
}

function normalizeDoctorCheck(value: unknown): OmadaPrintingPressDoctorCheck {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.status !== "string") {
    return {
      name: "unknown",
      status: "fail"
    };
  }

  return {
    detail: readOptionalString(value.detail),
    name: value.name,
    status: value.status
  };
}

function parseObservations(stdout: string): NetworkObservation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("Omada Printing Press CLI returned non-JSON output");
  }

  let rows: unknown[] | undefined;
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (isRecord(parsed)) {
    const envelope = parsed as ObservationEnvelope;
    if (Array.isArray(envelope.observations)) rows = envelope.observations;
  }

  if (!rows) throw new Error("Omada Printing Press CLI returned an unexpected output shape");

  return rows.map((row, index) => normalizeCliObservation(row, index));
}

function normalizeCliObservation(row: unknown, index: number): NetworkObservation {
  if (!isRecord(row)) throw new Error(`Omada Printing Press observation ${index + 1} is not an object`);
  if (typeof row.mac !== "string" || !row.mac) {
    throw new Error(`Omada Printing Press observation ${index + 1} is missing mac`);
  }

  return {
    apName: readOptionalString(row.apName),
    eventType: row.eventType === "client_disconnected" || row.eventType === "usage_sample" ? row.eventType : "client_seen",
    hostname: readOptionalString(row.hostname),
    ip: readOptionalString(row.ip),
    location: readOptionalString(row.location),
    mac: row.mac,
    observedAt: readOptionalString(row.observedAt) ?? new Date().toISOString(),
    privateMacSuspected: typeof row.privateMacSuspected === "boolean" ? row.privateMacSuspected : undefined,
    providerId: readOptionalString(row.providerId) ?? "omada",
    providerType: "omada",
    raw: row.raw,
    rxBytes: readNumber(row.rxBytes),
    ssid: readOptionalString(row.ssid),
    txBytes: readNumber(row.txBytes)
  };
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readExecStdout(error: unknown) {
  if (!isRecord(error)) return "";
  return typeof error.stdout === "string" ? error.stdout : "";
}
