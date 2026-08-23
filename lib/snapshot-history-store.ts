import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DeviceSnapshot } from "./device-ledger";
import { buildSessionSnapshot } from "./session-rollups";
import {
  buildSnapshotCaptureComparison,
  createSnapshotHistoryEntry,
  type SnapshotCaptureRecord,
  type SnapshotCaptureComparison,
  type SnapshotHistoryEntry
} from "./snapshot-history";

const defaultCaptureLimit = 25;
const defaultHistoryLimit = 100;

type SnapshotHistoryFile = {
  captures: SnapshotCaptureRecord[];
  entries: SnapshotHistoryEntry[];
};

export async function appendSnapshotHistory(
  snapshot: DeviceSnapshot,
  env: NodeJS.ProcessEnv = process.env
): Promise<SnapshotHistoryEntry[]> {
  const entry = createSnapshotHistoryEntry(snapshot.source, snapshot.devices, snapshot.observedAt);
  const current = await readSnapshotHistoryFile(env);
  const capture: SnapshotCaptureRecord = {
    capturedAt: new Date().toISOString(),
    deviceSnapshot: snapshot,
    id: entry.id,
    sessionSnapshot: buildSessionSnapshot(snapshot),
    summary: entry
  };
  const nextFile: SnapshotHistoryFile = {
    captures: dedupeCaptures([capture, ...current.captures]).slice(0, defaultCaptureLimit),
    entries: dedupeHistoryEntries([entry, ...current.entries]).slice(0, defaultHistoryLimit)
  };
  await writeSnapshotHistoryFile(nextFile, env);
  return nextFile.entries;
}

export async function readSnapshotHistory(env: NodeJS.ProcessEnv = process.env): Promise<SnapshotHistoryEntry[]> {
  return (await readSnapshotHistoryFile(env)).entries;
}

export async function readSnapshotCaptures(env: NodeJS.ProcessEnv = process.env): Promise<SnapshotCaptureRecord[]> {
  return (await readSnapshotHistoryFile(env)).captures;
}

export async function readSnapshotCapture(id: string, env: NodeJS.ProcessEnv = process.env) {
  const captures = await readSnapshotCaptures(env);
  return captures.find((capture) => capture.id === id);
}

export async function readSnapshotCaptureDetail(
  id: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ capture: SnapshotCaptureRecord; comparison?: SnapshotCaptureComparison } | undefined> {
  const captures = await readSnapshotCaptures(env);
  const capture = captures.find((candidate) => candidate.id === id);
  if (!capture) return undefined;

  const previous = captures
    .filter((candidate) =>
      candidate.id !== capture.id &&
      candidate.summary.source === capture.summary.source &&
      new Date(candidate.summary.observedAt).getTime() < new Date(capture.summary.observedAt).getTime()
    )
    .sort((a, b) => new Date(b.summary.observedAt).getTime() - new Date(a.summary.observedAt).getTime())[0];

  return {
    capture,
    comparison: previous ? buildSnapshotCaptureComparison(capture, previous) : undefined
  };
}

export async function updateSnapshotCaptureReview(
  id: string,
  update: { reviewNote?: string; reviewedAt?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<{ capture: SnapshotCaptureRecord; comparison?: SnapshotCaptureComparison; entries: SnapshotHistoryEntry[] } | undefined> {
  const current = await readSnapshotHistoryFile(env);
  let found = false;

  const entries = current.entries.map((entry) => (entry.id === id ? applyCaptureReviewUpdate(entry, update) : entry));
  const captures = current.captures.map((capture) => {
    if (capture.id !== id) return capture;
    found = true;
    return {
      ...capture,
      summary: applyCaptureReviewUpdate(capture.summary, update)
    };
  });

  if (!found) return undefined;

  await writeSnapshotHistoryFile({ captures, entries }, env);
  const detail = await readSnapshotCaptureDetail(id, env);
  if (!detail) return undefined;

  return {
    ...detail,
    entries
  };
}

export async function clearSnapshotHistory(env: NodeJS.ProcessEnv = process.env) {
  await writeSnapshotHistoryFile({ captures: [], entries: [] }, env);
}

export async function deleteSnapshotCapture(
  id: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ deleted: boolean; entries: SnapshotHistoryEntry[] }> {
  const current = await readSnapshotHistoryFile(env);
  const captures = current.captures.filter((capture) => capture.id !== id);
  const entries = current.entries.filter((entry) => entry.id !== id);
  const deleted = captures.length !== current.captures.length || entries.length !== current.entries.length;

  if (!deleted) {
    return {
      deleted,
      entries: current.entries
    };
  }

  await writeSnapshotHistoryFile({ captures, entries }, env);
  return {
    deleted,
    entries
  };
}

async function readSnapshotHistoryFile(env: NodeJS.ProcessEnv): Promise<SnapshotHistoryFile> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ getSnapshotHistoryPath(env), "utf8");
    const parsed = JSON.parse(raw) as Partial<SnapshotHistoryFile> | SnapshotHistoryEntry[];
    const entries = Array.isArray(parsed) ? parsed : parsed.entries;
    const captures = Array.isArray(parsed) ? [] : parsed.captures;
    return {
      captures: Array.isArray(captures) ? captures.filter(isSnapshotCaptureRecord) : [],
      entries: Array.isArray(entries) ? entries.filter(isSnapshotHistoryEntry) : []
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { captures: [], entries: [] };
    throw error;
  }
}

function getSnapshotHistoryPath(env: NodeJS.ProcessEnv) {
  return env.WHOFI_SNAPSHOT_HISTORY_PATH || join(process.cwd(), ".whofi", "snapshot-history.json");
}

async function writeSnapshotHistoryFile(file: SnapshotHistoryFile, env: NodeJS.ProcessEnv) {
  const filePath = getSnapshotHistoryPath(env);
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmpPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  await rename(/* turbopackIgnore: true */ tmpPath, filePath);
}

function dedupeHistoryEntries(entries: SnapshotHistoryEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.source}:${entry.observedAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeCaptures(captures: SnapshotCaptureRecord[]) {
  const seen = new Set<string>();
  return captures.filter((capture) => {
    if (seen.has(capture.id)) return false;
    seen.add(capture.id);
    return true;
  });
}

function applyCaptureReviewUpdate(
  entry: SnapshotHistoryEntry,
  update: { reviewNote?: string; reviewedAt?: string }
): SnapshotHistoryEntry {
  return {
    ...entry,
    reviewNote: update.reviewNote,
    reviewedAt: update.reviewedAt
  };
}

function isSnapshotCaptureRecord(value: unknown): value is SnapshotCaptureRecord {
  if (!value || typeof value !== "object") return false;
  const capture = value as Partial<SnapshotCaptureRecord>;
  return Boolean(
    capture.id &&
      capture.capturedAt &&
      capture.deviceSnapshot &&
      capture.sessionSnapshot &&
      isSnapshotHistoryEntry(capture.summary)
  );
}

function isSnapshotHistoryEntry(value: unknown): value is SnapshotHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<SnapshotHistoryEntry>;
  return Boolean(
    entry.id &&
      entry.observedAt &&
      entry.source &&
      typeof entry.onlineDevices === "number" &&
      typeof entry.reviewSignals === "number" &&
      typeof entry.totalBytes === "number" &&
      typeof entry.unknownDevices === "number"
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
