import { formatBytes } from "./format";
import type {
  SnapshotCaptureComparison,
  SnapshotCaptureRecord,
  SnapshotDeviceChange,
  SnapshotReviewQueueItem,
  SnapshotReviewQueueSummary,
  SnapshotReviewSignal
} from "./snapshot-history";
import type { SnapshotTrendPoint, SnapshotTrendReport } from "./snapshot-trends";
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

export function buildSnapshotReviewQueueReport({
  generatedAt = new Date().toISOString(),
  queue,
  severityFilter,
  sourceFilter,
  summary
}: {
  generatedAt?: string;
  queue: SnapshotReviewQueueItem[];
  severityFilter: string;
  sourceFilter: string;
  summary: SnapshotReviewQueueSummary;
}) {
  const lines = [
    "# WhoFi Snapshot Review Queue",
    "",
    `Generated At: ${generatedAt}`,
    `Source Filter: ${sourceFilter}`,
    `Severity Filter: ${severityFilter}`,
    "",
    "## Workload",
    "",
    `- Open: ${summary.open}`,
    `- Warning: ${summary.warning}`,
    `- Watch: ${summary.watch}`,
    `- Reviewed: ${summary.reviewed}`,
    `- Total stored captures: ${summary.total}`,
    "",
    "## Open Reviews",
    "",
    ...formatQueueItems(queue)
  ];

  return `${lines.join("\n")}\n`;
}

export function buildSnapshotTrendReport({
  generatedAt = new Date().toISOString(),
  trends
}: {
  generatedAt?: string;
  trends: SnapshotTrendReport;
}) {
  const lines = [
    "# WhoFi Snapshot Trend Report",
    "",
    `Generated At: ${generatedAt}`,
    `Source Filter: ${trends.source}`,
    "",
    "## Summary",
    "",
    `- Captures: ${trends.summary.captures}`,
    `- Open reviews: ${trends.summary.openReviews}`,
    `- Reviewed captures: ${trends.summary.reviewedCaptures}`,
    `- Max unknown devices: ${trends.summary.maxUnknownDevices}`,
    `- Max review signals: ${trends.summary.maxReviewSignals}`,
    `- Latest device delta: ${formatSignedNumber(trends.summary.latestDeviceDelta)}`,
    `- Latest unknown delta: ${formatSignedNumber(trends.summary.latestUnknownDelta)}`,
    `- Latest usage delta: ${formatSignedBytes(trends.summary.latestTotalBytesDelta)}`,
    `- First-to-latest usage delta: ${formatSignedBytes(trends.summary.totalBytesDelta)}`,
    trends.summary.firstObservedAt ? `- First observed at: ${trends.summary.firstObservedAt}` : undefined,
    trends.summary.lastObservedAt ? `- Last observed at: ${trends.summary.lastObservedAt}` : undefined,
    "",
    "## Recent Points",
    "",
    ...formatTrendPoints(trends.points)
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

function formatQueueItems(items: SnapshotReviewQueueItem[]) {
  if (!items.length) return ["No open capture reviews match these filters."];

  return items.map((item) =>
    [
      `- ${item.id}`,
      `  - Source: ${item.source}`,
      `  - Severity: ${item.severity}`,
      `  - Observed at: ${item.observedAt}`,
      `  - Unknown devices: ${item.unknownDevices}`,
      `  - Reason: ${item.reason}`,
      item.reviewNote ? `  - Review note: ${item.reviewNote}` : undefined
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n")
  );
}

function formatTrendPoints(points: SnapshotTrendPoint[]) {
  if (!points.length) return ["No stored captures match this source filter."];

  return [...points].reverse().map(
    (point) =>
      `- ${point.observedAt}: ${point.onlineDevices} devices, ${point.unknownDevices} unknown, ${point.reviewSignals} review signals, ${formatBytes(point.totalBytes)} (${point.reviewed ? "reviewed" : "open"})`
  );
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
