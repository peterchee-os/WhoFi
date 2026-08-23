import { demoDevices } from "./demo-data";
import type { NetworkObservation } from "./providers/types";
import type { Device, DeviceStatus, RiskState } from "./types";

export type DeviceSource = "demo" | "omada" | "omada-pp";

export type DeviceSnapshot = {
  count: number;
  devices: Device[];
  observedAt: string;
  source: DeviceSource;
  verificationClient?: DeviceSnapshotVerification;
};

export type DeviceSnapshotVerification = {
  configured: boolean;
  kind: DeviceSnapshotVerificationKind;
  label?: string;
  present: boolean;
};

export type DeviceSnapshotVerificationKind = "access_point" | "client";

export type DeviceSnapshotOptions = {
  verificationAnchorKind?: string;
  verificationClientMac?: string;
  verificationClientLabel?: string;
};

export function buildDemoDeviceSnapshot(options: DeviceSnapshotOptions = {}): DeviceSnapshot {
  return {
    count: demoDevices.length,
    devices: demoDevices,
    observedAt: new Date().toISOString(),
    source: "demo",
    verificationClient: verifyClientPresence(demoDevices, options)
  };
}

export function buildDeviceSnapshotFromObservations(
  source: Exclude<DeviceSource, "demo">,
  observations: NetworkObservation[],
  observedAt = new Date().toISOString(),
  options: DeviceSnapshotOptions = {}
): DeviceSnapshot {
  const devices = observations.map((observation) => deviceFromObservation(source, observation));

  return {
    count: devices.length,
    devices,
    observedAt,
    source,
    verificationClient: verifyAnchorPresence(devices, options, observations)
  };
}

function deviceFromObservation(source: Exclude<DeviceSource, "demo">, observation: NetworkObservation): Device {
  return {
    apName: observation.apName ?? "Unknown AP",
    burstScore: observation.burstScore ?? inferBurstScore(observation),
    firstSeen: observation.observedAt,
    hostname: observation.hostname ?? "Unknown device",
    id: `${source}:${observation.providerId}:${observation.mac}`,
    ip: observation.ip ?? "",
    lastSeen: observation.observedAt,
    location: observation.location ?? "Unknown location",
    mac: observation.mac,
    privateMacSuspected: observation.privateMacSuspected,
    profileId: undefined,
    riskState: inferRiskState(observation),
    rxBytes: observation.rxBytes,
    ssid: observation.ssid ?? "Unknown SSID",
    status: inferDeviceStatus(observation),
    txBytes: observation.txBytes
  };
}

function inferDeviceStatus(observation: NetworkObservation): DeviceStatus {
  if (observation.eventType === "client_disconnected") return "ignored";
  return "unknown";
}

function inferRiskState(observation: NetworkObservation): RiskState {
  if (observation.burstScore && observation.burstScore >= 80) return "automation_like";
  if (observation.burstScore && observation.burstScore >= 50) return "watch";
  return "normal";
}

function inferBurstScore(observation: NetworkObservation) {
  const totalBytes = observation.rxBytes + observation.txBytes;
  if (totalBytes >= 25_000_000_000) return 90;
  if (totalBytes >= 10_000_000_000) return 70;
  if (totalBytes >= 2_000_000_000) return 35;
  return 5;
}

function verifyClientPresence(devices: Device[], options: DeviceSnapshotOptions): DeviceSnapshotVerification | undefined {
  return verifyAnchorPresence(devices, options);
}

function verifyAnchorPresence(
  devices: Device[],
  options: DeviceSnapshotOptions,
  observations: NetworkObservation[] = []
): DeviceSnapshotVerification | undefined {
  const normalizedMac = normalizeMac(options.verificationClientMac);
  if (!normalizedMac) return undefined;
  const kind = readVerificationKind(options.verificationAnchorKind);
  const present = kind === "access_point"
    ? observations.some((observation) => normalizeMac(observation.apMac) === normalizedMac)
    : devices.some((device) => normalizeMac(device.mac) === normalizedMac);

  return {
    configured: true,
    kind,
    label: options.verificationClientLabel?.trim() || undefined,
    present
  };
}

function readVerificationKind(value?: string): DeviceSnapshotVerificationKind {
  return value === "access_point" ? "access_point" : "client";
}

function normalizeMac(value?: string) {
  const hex = value?.replace(/[^A-Fa-f0-9]/g, "").toLowerCase();
  return hex?.length === 12 ? hex : undefined;
}
