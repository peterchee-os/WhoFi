import { buildSessionSnapshot, type UsageRollup, type UsageRollupDimension } from "./session-rollups";
import type { DeviceSnapshot, DeviceSource } from "./device-ledger";
import type { SessionSnapshot } from "./session-rollups";
import type { Device } from "./types";

export type SnapshotHistoryEntry = {
  id: string;
  observedAt: string;
  onlineDevices: number;
  reviewSignals: number;
  source: DeviceSource;
  topAp?: string;
  topLocation?: string;
  topSsid?: string;
  totalBytes: number;
  unknownDevices: number;
};

export type SnapshotCaptureRecord = {
  capturedAt: string;
  deviceSnapshot: DeviceSnapshot;
  id: string;
  sessionSnapshot: SessionSnapshot;
  summary: SnapshotHistoryEntry;
};

export type SnapshotCaptureComparison = {
  deltas: {
    onlineDevices: number;
    reviewSignals: number;
    totalBytes: number;
    totalRxBytes: number;
    totalTxBytes: number;
    unknownDevices: number;
  };
  missingDevices: SnapshotDeviceChange[];
  newDevices: SnapshotDeviceChange[];
  previousCapturedAt: string;
  previousId: string;
  previousObservedAt: string;
};

export type SnapshotDeviceChange = {
  apName: string;
  hostname: string;
  id: string;
  ssid: string;
  status: string;
  totalBytes: number;
};

export function buildSnapshotCaptureComparison(
  current: SnapshotCaptureRecord,
  previous: SnapshotCaptureRecord
): SnapshotCaptureComparison {
  return {
    deltas: {
      onlineDevices: current.summary.onlineDevices - previous.summary.onlineDevices,
      reviewSignals: current.summary.reviewSignals - previous.summary.reviewSignals,
      totalBytes: current.summary.totalBytes - previous.summary.totalBytes,
      totalRxBytes: current.sessionSnapshot.totals.totalRxBytes - previous.sessionSnapshot.totals.totalRxBytes,
      totalTxBytes: current.sessionSnapshot.totals.totalTxBytes - previous.sessionSnapshot.totals.totalTxBytes,
      unknownDevices: current.summary.unknownDevices - previous.summary.unknownDevices
    },
    missingDevices: getMissingDevices(current, previous),
    newDevices: getNewDevices(current, previous),
    previousCapturedAt: previous.capturedAt,
    previousId: previous.id,
    previousObservedAt: previous.summary.observedAt
  };
}

function getNewDevices(current: SnapshotCaptureRecord, previous: SnapshotCaptureRecord) {
  const previousDeviceIds = new Set(previous.deviceSnapshot.devices.map((device) => device.id));
  return current.deviceSnapshot.devices
    .filter((device) => !previousDeviceIds.has(device.id))
    .map(toDeviceChange)
    .sort((a, b) => b.totalBytes - a.totalBytes)
    .slice(0, 6);
}

function getMissingDevices(current: SnapshotCaptureRecord, previous: SnapshotCaptureRecord) {
  const currentDeviceIds = new Set(current.deviceSnapshot.devices.map((device) => device.id));
  return previous.deviceSnapshot.devices
    .filter((device) => !currentDeviceIds.has(device.id))
    .map(toDeviceChange)
    .sort((a, b) => b.totalBytes - a.totalBytes)
    .slice(0, 6);
}

function toDeviceChange(device: Device): SnapshotDeviceChange {
  return {
    apName: device.apName,
    hostname: device.hostname,
    id: device.id,
    ssid: device.ssid,
    status: device.status,
    totalBytes: device.rxBytes + device.txBytes
  };
}

export function createSnapshotHistoryEntry(
  source: DeviceSource,
  devices: Device[],
  observedAt: string,
  id = createHistoryId()
): SnapshotHistoryEntry {
  const sessionSnapshot = buildSessionSnapshot({
    count: devices.length,
    devices,
    observedAt,
    source
  });

  return {
    id,
    observedAt,
    onlineDevices: sessionSnapshot.totals.onlineDevices,
    reviewSignals: sessionSnapshot.totals.reviewSignals,
    source,
    topAp: getTopRollupLabel(sessionSnapshot.rollups, "ap"),
    topLocation: getTopRollupLabel(sessionSnapshot.rollups, "location"),
    topSsid: getTopRollupLabel(sessionSnapshot.rollups, "ssid"),
    totalBytes: sessionSnapshot.totals.totalBytes,
    unknownDevices: sessionSnapshot.totals.unknownDevices
  };
}

function getTopRollupLabel(rollups: UsageRollup[], dimension: UsageRollupDimension) {
  return rollups.find((rollup) => rollup.dimension === dimension)?.label;
}

function createHistoryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `snapshot-${Date.now()}`;
}
