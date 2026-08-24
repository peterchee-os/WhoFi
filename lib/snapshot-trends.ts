import type { DeviceSource } from "./device-ledger";
import {
  buildSnapshotReviewQueue,
  type SnapshotHistoryEntry,
  type SnapshotReviewPolicy
} from "./snapshot-history";

export type SnapshotTrendSourceFilter = "all" | DeviceSource;

export type SnapshotTrendPoint = {
  id: string;
  observedAt: string;
  onlineDevices: number;
  reviewSignals: number;
  reviewed: boolean;
  source: DeviceSource;
  totalBytes: number;
  unknownDevices: number;
};

export type SnapshotTrendSummary = {
  captures: number;
  firstObservedAt?: string;
  lastObservedAt?: string;
  latestDeviceDelta: number;
  latestTotalBytesDelta: number;
  latestUnknownDelta: number;
  maxReviewSignals: number;
  maxUnknownDevices: number;
  openReviews: number;
  reviewedCaptures: number;
  totalBytesDelta: number;
};

export type SnapshotTrendReport = {
  points: SnapshotTrendPoint[];
  source: SnapshotTrendSourceFilter;
  summary: SnapshotTrendSummary;
};

export function buildSnapshotTrends(
  entries: SnapshotHistoryEntry[],
  policy: SnapshotReviewPolicy,
  source: SnapshotTrendSourceFilter = "all"
): SnapshotTrendReport {
  const filteredEntries = source === "all" ? entries : entries.filter((entry) => entry.source === source);
  const sortedEntries = [...filteredEntries].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
  );
  const first = sortedEntries[0];
  const latest = sortedEntries[sortedEntries.length - 1];
  const previous = sortedEntries[sortedEntries.length - 2];
  const queue = buildSnapshotReviewQueue(filteredEntries, policy);

  return {
    points: sortedEntries.slice(-12).map(toTrendPoint),
    source,
    summary: {
      captures: sortedEntries.length,
      firstObservedAt: first?.observedAt,
      lastObservedAt: latest?.observedAt,
      latestDeviceDelta: latest && previous ? latest.onlineDevices - previous.onlineDevices : 0,
      latestTotalBytesDelta: latest && previous ? latest.totalBytes - previous.totalBytes : 0,
      latestUnknownDelta: latest && previous ? latest.unknownDevices - previous.unknownDevices : 0,
      maxReviewSignals: maxOf(sortedEntries, "reviewSignals"),
      maxUnknownDevices: maxOf(sortedEntries, "unknownDevices"),
      openReviews: queue.length,
      reviewedCaptures: sortedEntries.filter((entry) => Boolean(entry.reviewedAt)).length,
      totalBytesDelta: latest && first ? latest.totalBytes - first.totalBytes : 0
    }
  };
}

function toTrendPoint(entry: SnapshotHistoryEntry): SnapshotTrendPoint {
  return {
    id: entry.id,
    observedAt: entry.observedAt,
    onlineDevices: entry.onlineDevices,
    reviewSignals: entry.reviewSignals,
    reviewed: Boolean(entry.reviewedAt),
    source: entry.source,
    totalBytes: entry.totalBytes,
    unknownDevices: entry.unknownDevices
  };
}

function maxOf(entries: SnapshotHistoryEntry[], key: "reviewSignals" | "unknownDevices") {
  return entries.reduce((max, entry) => Math.max(max, entry[key]), 0);
}
