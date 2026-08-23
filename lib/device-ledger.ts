import { demoDevices } from "./demo-data";
import type { NetworkObservation } from "./providers/types";
import type { Device, DeviceStatus, RiskState } from "./types";

export type DeviceSource = "demo" | "omada" | "omada-pp";

export type DeviceSnapshot = {
  count: number;
  devices: Device[];
  observedAt: string;
  source: DeviceSource;
};

export function buildDemoDeviceSnapshot(): DeviceSnapshot {
  return {
    count: demoDevices.length,
    devices: demoDevices,
    observedAt: new Date().toISOString(),
    source: "demo"
  };
}

export function buildDeviceSnapshotFromObservations(
  source: Exclude<DeviceSource, "demo">,
  observations: NetworkObservation[],
  observedAt = new Date().toISOString()
): DeviceSnapshot {
  const devices = observations.map((observation) => deviceFromObservation(source, observation));

  return {
    count: devices.length,
    devices,
    observedAt,
    source
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
