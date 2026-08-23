import { formatBytes } from "./format";
import type { SnapshotCaptureComparison, SnapshotCaptureRecord, SnapshotDeviceChange, SnapshotReviewSignal } from "./snapshot-history";
import type { Device } from "./types";

export function buildSnapshotCaptureReport({
  capture,
  comparison
}: {
  capture: SnapshotCaptureRecord;
  comparison?: SnapshotCaptureComparison;
}) {
  const lines = [
    `# WhoFi Snapshot Capture Report`,
    "",
    `Capture ID: ${capture.id}`,
    `Source: ${capture.summary.source}`,
    `Observed At: ${capture.summary.observedAt}`,
    `Captured At: ${capture.capturedAt}`,
    `Review: ${capture.summary.reviewedAt ? `Reviewed at ${capture.summary.reviewedAt}` : "Open"}`,
    capture.summary.reviewNote ? `Review Note: ${capture.summary.reviewNote}` : undefined,
    "",
    "## Summary",
    "",
    `- Online devices: ${capture.summary.onlineDevices}`,
    `- Unknown devices: ${capture.summary.unknownDevices}`,
    `- Review signals: ${capture.summary.reviewSignals}`,
    `- Total usage: ${formatBytes(capture.summary.totalBytes)}`,
    "",
    "## Comparison",
    "",
    ...formatComparison(comparison),
    "",
    "## Review Signals",
    "",
    ...formatReviewSignals(comparison?.reviewSignals ?? []),
    "",
    "## New Devices",
    "",
    ...formatDeviceChanges(comparison?.newDevices ?? []),
    "",
    "## Missing Devices",
    "",
    ...formatDeviceChanges(comparison?.missingDevices ?? []),
    "",
    "## Top Devices",
    "",
    ...formatTopDevices(capture.deviceSnapshot.devices)
  ].filter((line): line is string => line !== undefined);

  return `${lines.join("\n")}\n`;
}

function formatComparison(comparison?: SnapshotCaptureComparison) {
  if (!comparison) return ["No previous same-source capture was available."];

  return [
    `Compared To: ${comparison.previousId}`,
    `Previous Observed At: ${comparison.previousObservedAt}`,
    `- Devices: ${formatSignedNumber(comparison.deltas.onlineDevices)}`,
    `- Unknown: ${formatSignedNumber(comparison.deltas.unknownDevices)}`,
    `- Review signals: ${formatSignedNumber(comparison.deltas.reviewSignals)}`,
    `- Total usage: ${formatSignedBytes(comparison.deltas.totalBytes)}`
  ];
}

function formatReviewSignals(signals: SnapshotReviewSignal[]) {
  if (!signals.length) return ["No generated review signals."];
  return signals.map((signal) => `- ${signal.label} (${signal.severity}): ${signal.detail}`);
}

function formatDeviceChanges(devices: SnapshotDeviceChange[]) {
  if (!devices.length) return ["No devices."];
  return devices.map(
    (device) => `- ${device.hostname} (${device.status}) on ${device.ssid} / ${device.apName}: ${formatBytes(device.totalBytes)}`
  );
}

function formatTopDevices(devices: Device[]) {
  const topDevices = [...devices].sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes)).slice(0, 8);
  if (!topDevices.length) return ["No devices."];
  return topDevices.map(
    (device) => `- ${device.hostname} (${device.status}, ${device.riskState}) on ${device.ssid} / ${device.apName}: ${formatBytes(device.rxBytes + device.txBytes)}`
  );
}

function formatSignedNumber(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function formatSignedBytes(value: number) {
  if (value > 0) return `+${formatBytes(value)}`;
  if (value < 0) return `-${formatBytes(Math.abs(value))}`;
  return "0 B";
}
