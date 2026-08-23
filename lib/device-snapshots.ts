import {
  buildDemoDeviceSnapshot,
  buildDeviceSnapshotFromObservations,
  type DeviceSnapshot,
  type DeviceSnapshotOptions,
  type DeviceSource
} from "./device-ledger";
import { getOmadaClientFromEnv, listOmadaObservations } from "./providers/omada";
import {
  getOmadaPrintingPressConfigFromEnv,
  listOmadaPrintingPressObservations
} from "./providers/omada-printing-press";

export type LiveSourceAccessError = {
  error: string;
  status: number;
};

export function readDeviceSource(value: string | null): DeviceSource {
  if (value === "omada" || value === "omada-pp") return value;
  return "demo";
}

export function getDeviceSnapshotVerificationOptions(env: NodeJS.ProcessEnv = process.env): DeviceSnapshotOptions {
  return {
    verificationAnchorKind: env.WHOFI_VERIFICATION_ANCHOR_KIND,
    verificationClientLabel: env.WHOFI_VERIFICATION_CLIENT_LABEL,
    verificationClientMac: env.WHOFI_VERIFICATION_CLIENT_MAC
  };
}

export function getLiveSourceAccessError(
  source: DeviceSource,
  headers: Headers,
  env: NodeJS.ProcessEnv = process.env
): LiveSourceAccessError | undefined {
  if (source === "demo") return undefined;

  if (env.WHOFI_ENABLE_LIVE_DEVICE_SOURCES !== "true") {
    return {
      error: "Live device sources are disabled",
      status: 403
    };
  }

  const expectedToken = env.WHOFI_LIVE_DEVICE_SOURCE_TOKEN;
  if (expectedToken && headers.get("X-WhoFi-Live-Source-Token") !== expectedToken) {
    return {
      error: "Live device source token required",
      status: 401
    };
  }

  return undefined;
}

export async function loadDeviceSnapshot(
  source: DeviceSource,
  env: NodeJS.ProcessEnv = process.env
): Promise<DeviceSnapshot> {
  const verificationOptions = getDeviceSnapshotVerificationOptions(env);

  if (source === "demo") {
    return buildDemoDeviceSnapshot(verificationOptions);
  }

  if (source === "omada") {
    const client = getOmadaClientFromEnv(env);
    const observations = await listOmadaObservations(client, {
      currentPage: 1,
      currentPageSize: 100
    });
    return buildDeviceSnapshotFromObservations(source, observations, undefined, verificationOptions);
  }

  const config = getOmadaPrintingPressConfigFromEnv(env);
  const result = await listOmadaPrintingPressObservations(config, env);
  return buildDeviceSnapshotFromObservations(source, result.observations, undefined, verificationOptions);
}

export function redactDeviceSourceError(value: string) {
  return value
    .replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/([A-Fa-f0-9]{2}[:-]){5}[A-Fa-f0-9]{2}/g, "[mac]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]");
}
