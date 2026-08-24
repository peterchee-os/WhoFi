import { buildSessionSnapshot, type UsageRollup, type UsageRollupDimension } from "./session-rollups";
import type { DeviceSnapshot, DeviceSource } from "./device-ledger";
import type { SessionSnapshot } from "./session-rollups";
import type { Device } from "./types";

export type SnapshotHistoryEntry = {
  id: string;
  observedAt: string;
  onlineDevices: number;
  reviewNote?: string;
  reviewSignals: number;
  reviewedAt?: string;
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
  reviewSignals: SnapshotReviewSignal[];
};

export type SnapshotDeviceChange = {
  apName: string;
  hostname: string;
  id: string;
  ssid: string;
  status: string;
  totalBytes: number;
};

export type SnapshotReviewSignal = {
  detail: string;
  id: string;
  label: string;
  severity: "info" | "watch" | "warning";
};

export type SnapshotReviewQueueItem = {
  id: string;
  observedAt: string;
  reason: string;
  reviewNote?: string;
  severity: "watch" | "warning";
  source: DeviceSource;
  unknownDevices: number;
};

export type SnapshotReviewQueueSummary = {
  open: number;
  reviewed: number;
  total: number;
  warning: number;
  watch: number;
};

export type SnapshotReviewPolicy = {
  highUsageBytes: number;
  reviewSignalThreshold: number;
  triggerOnHighUsage: boolean;
  triggerOnReviewSignals: boolean;
  triggerOnUnknownDevices: boolean;
  unknownDeviceThreshold: number;
};

export const defaultSnapshotReviewPolicy: SnapshotReviewPolicy = {
  highUsageBytes: 50 * 1024 ** 3,
  reviewSignalThreshold: 1,
  triggerOnHighUsage: false,
  triggerOnReviewSignals: true,
  triggerOnUnknownDevices: true,
  unknownDeviceThreshold: 1
};

export function buildSnapshotReviewQueue(
  entries: SnapshotHistoryEntry[],
  policy: SnapshotReviewPolicy = defaultSnapshotReviewPolicy
): SnapshotReviewQueueItem[] {
  return entries
    .filter((entry) => !entry.reviewedAt && getReviewQueueReasons(entry, policy).length > 0)
    .map((entry) => ({
      id: entry.id,
      observedAt: entry.observedAt,
      reason: getReviewQueueReasons(entry, policy).join(", "),
      reviewNote: entry.reviewNote,
      severity: getReviewQueueSeverity(entry, policy),
      source: entry.source,
      unknownDevices: entry.unknownDevices
    }))
    .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime());
}

export function buildSnapshotReviewQueueSummary(
  entries: SnapshotHistoryEntry[],
  queue = buildSnapshotReviewQueue(entries)
): SnapshotReviewQueueSummary {
  return {
    open: queue.length,
    reviewed: entries.filter((entry) => Boolean(entry.reviewedAt)).length,
    total: entries.length,
    warning: queue.filter((item) => item.severity === "warning").length,
    watch: queue.filter((item) => item.severity === "watch").length
  };
}

export function buildSnapshotCaptureComparison(
  current: SnapshotCaptureRecord,
  previous: SnapshotCaptureRecord
): SnapshotCaptureComparison {
  const newDevices = getNewDevices(current, previous);
  const missingDevices = getMissingDevices(current, previous);

  return {
    deltas: {
      onlineDevices: current.summary.onlineDevices - previous.summary.onlineDevices,
      reviewSignals: current.summary.reviewSignals - previous.summary.reviewSignals,
      totalBytes: current.summary.totalBytes - previous.summary.totalBytes,
      totalRxBytes: current.sessionSnapshot.totals.totalRxBytes - previous.sessionSnapshot.totals.totalRxBytes,
      totalTxBytes: current.sessionSnapshot.totals.totalTxBytes - previous.sessionSnapshot.totals.totalTxBytes,
      unknownDevices: current.summary.unknownDevices - previous.summary.unknownDevices
    },
    missingDevices,
    newDevices,
    previousCapturedAt: previous.capturedAt,
    previousId: previous.id,
    previousObservedAt: previous.summary.observedAt,
    reviewSignals: buildReviewSignals(current, previous, newDevices, missingDevices)
  };
}

export function normalizeSnapshotReviewPolicy(value: Partial<SnapshotReviewPolicy> = {}): SnapshotReviewPolicy {
  return {
    highUsageBytes: normalizeInteger(value.highUsageBytes, defaultSnapshotReviewPolicy.highUsageBytes),
    reviewSignalThreshold: normalizeInteger(value.reviewSignalThreshold, defaultSnapshotReviewPolicy.reviewSignalThreshold, 1),
    triggerOnHighUsage: typeof value.triggerOnHighUsage === "boolean" ? value.triggerOnHighUsage : defaultSnapshotReviewPolicy.triggerOnHighUsage,
    triggerOnReviewSignals:
      typeof value.triggerOnReviewSignals === "boolean" ? value.triggerOnReviewSignals : defaultSnapshotReviewPolicy.triggerOnReviewSignals,
    triggerOnUnknownDevices:
      typeof value.triggerOnUnknownDevices === "boolean" ? value.triggerOnUnknownDevices : defaultSnapshotReviewPolicy.triggerOnUnknownDevices,
    unknownDeviceThreshold: normalizeInteger(value.unknownDeviceThreshold, defaultSnapshotReviewPolicy.unknownDeviceThreshold, 1)
  };
}

function getReviewQueueReasons(entry: SnapshotHistoryEntry, policy: SnapshotReviewPolicy) {
  const reasons: string[] = [];

  if (policy.triggerOnReviewSignals && entry.reviewSignals >= policy.reviewSignalThreshold) {
    reasons.push(`${entry.reviewSignals} review ${pluralize("signal", entry.reviewSignals)}`);
  }

  if (policy.triggerOnUnknownDevices && entry.unknownDevices >= policy.unknownDeviceThreshold) {
    reasons.push(`${entry.unknownDevices} unknown ${pluralize("device", entry.unknownDevices)}`);
  }

  if (policy.triggerOnHighUsage && entry.totalBytes >= policy.highUsageBytes) {
    reasons.push(`${formatPolicyBytes(entry.totalBytes)} usage`);
  }

  return reasons;
}

function getReviewQueueSeverity(entry: SnapshotHistoryEntry, policy: SnapshotReviewPolicy): SnapshotReviewQueueItem["severity"] {
  if (policy.triggerOnReviewSignals && entry.reviewSignals >= policy.reviewSignalThreshold) return "warning";
  if (policy.triggerOnUnknownDevices && entry.unknownDevices >= policy.unknownDeviceThreshold && entry.reviewSignals > 0) {
    return "warning";
  }
  return "watch";
}

function normalizeInteger(value: unknown, fallback: number, min = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
}

function formatPolicyBytes(value: number) {
  if (value >= 1024 ** 3) return `${Math.round(value / 1024 ** 3)} GB`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
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

function buildReviewSignals(
  current: SnapshotCaptureRecord,
  previous: SnapshotCaptureRecord,
  newDevices: SnapshotDeviceChange[],
  missingDevices: SnapshotDeviceChange[]
): SnapshotReviewSignal[] {
  const currentDeviceIds = new Set(current.deviceSnapshot.devices.map((device) => device.id));
  const previousDeviceIds = new Set(previous.deviceSnapshot.devices.map((device) => device.id));
  const newRawDevices = current.deviceSnapshot.devices.filter((device) => !previousDeviceIds.has(device.id));
  const missingRawDevices = previous.deviceSnapshot.devices.filter((device) => !currentDeviceIds.has(device.id));
  const signals: SnapshotReviewSignal[] = [];
  const unknownNewDevices = newRawDevices.filter((device) => device.status === "unknown");
  const riskyNewDevices = newRawDevices.filter((device) => device.riskState !== "normal");
  const missingLinkedDevices = missingRawDevices.filter((device) =>
    ["agent_host", "claimed", "managed", "staff_assigned"].includes(device.status)
  );

  if (unknownNewDevices.length) {
    signals.push({
      detail: summarizeDeviceHostnames(unknownNewDevices),
      id: "new-unknown-devices",
      label: `${unknownNewDevices.length} new unknown ${pluralize("device", unknownNewDevices.length)}`,
      severity: "warning"
    });
  }

  if (riskyNewDevices.length) {
    signals.push({
      detail: summarizeDeviceHostnames(riskyNewDevices),
      id: "new-risky-devices",
      label: `${riskyNewDevices.length} new ${pluralize("device", riskyNewDevices.length)} with review state`,
      severity: "watch"
    });
  }

  if (missingLinkedDevices.length) {
    signals.push({
      detail: summarizeDeviceHostnames(missingLinkedDevices),
      id: "missing-linked-devices",
      label: `${missingLinkedDevices.length} linked ${pluralize("device", missingLinkedDevices.length)} disappeared`,
      severity: "watch"
    });
  }

  if (current.summary.unknownDevices > previous.summary.unknownDevices) {
    signals.push({
      detail: `${previous.summary.unknownDevices} -> ${current.summary.unknownDevices} unknown devices`,
      id: "unknown-count-increased",
      label: "Unknown device count increased",
      severity: "watch"
    });
  }

  if (current.summary.reviewSignals > previous.summary.reviewSignals) {
    signals.push({
      detail: `${previous.summary.reviewSignals} -> ${current.summary.reviewSignals} review signals`,
      id: "review-signal-count-increased",
      label: "Review signal count increased",
      severity: "watch"
    });
  }

  if (newDevices.length === 0 && missingDevices.length === 0 && signals.length === 0) {
    signals.push({
      detail: "No material device movement since the previous stored capture.",
      id: "stable-capture",
      label: "Stable capture",
      severity: "info"
    });
  }

  return signals.slice(0, 6);
}

function summarizeDeviceHostnames(devices: Device[]) {
  return devices
    .slice(0, 3)
    .map((device) => device.hostname || device.mac)
    .join(", ");
}

function pluralize(noun: string, count: number) {
  return count === 1 ? noun : `${noun}s`;
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
