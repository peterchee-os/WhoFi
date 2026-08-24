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
const maxCaptureLimit = 250;
const maxHistoryLimit = 1000;

export type SnapshotHistoryLimits = {
  captureLimit: number;
  historyLimit: number;
};

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
  const limits = getSnapshotHistoryLimits(env);
  const capture: SnapshotCaptureRecord = {
    capturedAt: new Date().toISOString(),
    deviceSnapshot: snapshot,
    id: entry.id,
    sessionSnapshot: buildSessionSnapshot(snapshot),
    summary: entry
  };
  const nextFile: SnapshotHistoryFile = {
    captures: dedupeCaptures([capture, ...current.captures]).slice(0, limits.captureLimit),
    entries: dedupeHistoryEntries([entry, ...current.entries]).slice(0, limits.historyLimit)
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

export async function updateSnapshotCaptureReviews(
  ids: string[],
  update: { reviewNote?: string; reviewedAt?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<{ entries: SnapshotHistoryEntry[]; updatedIds: string[] }> {
  const current = await readSnapshotHistoryFile(env);
  const requestedIds = new Set(ids);
  const updatedIds = new Set<string>();

  const entries = current.entries.map((entry) => {
    if (!requestedIds.has(entry.id)) return entry;
    updatedIds.add(entry.id);
    return applyCaptureReviewUpdate(entry, update);
  });
  const captures = current.captures.map((capture) => {
    if (!requestedIds.has(capture.id)) return capture;
    updatedIds.add(capture.id);
    return {
      ...capture,
      summary: applyCaptureReviewUpdate(capture.summary, update)
    };
  });

  if (updatedIds.size === 0) {
    return {
      entries: current.entries,
      updatedIds: []
    };
  }

  await writeSnapshotHistoryFile({ captures, entries }, env);
  return {
    entries,
    updatedIds: Array.from(updatedIds)
  };
}

export async function clearSnapshotHistory(env: NodeJS.ProcessEnv = process.env) {
  await writeSnapshotHistoryFile({ captures: [], entries: [] }, env);
}

export async function pruneSnapshotHistory(
  env: NodeJS.ProcessEnv = process.env
): Promise<{ captures: SnapshotCaptureRecord[]; entries: SnapshotHistoryEntry[]; prunedCaptures: number; prunedEntries: number }> {
  const current = await readSnapshotHistoryFile(env);
  const limits = getSnapshotHistoryLimits(env);
  const captures = dedupeCaptures(current.captures)
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
    .slice(0, limits.captureLimit);
  const entries = dedupeHistoryEntries(current.entries)
    .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())
    .slice(0, limits.historyLimit);

  await writeSnapshotHistoryFile({ captures, entries }, env);

  return {
    captures,
    entries,
    prunedCaptures: Math.max(0, current.captures.length - captures.length),
    prunedEntries: Math.max(0, current.entries.length - entries.length)
  };
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

export async function importSnapshotArchive(
  archive: { captures?: unknown; entries?: unknown },
  env: NodeJS.ProcessEnv = process.env
): Promise<{ captures: SnapshotCaptureRecord[]; entries: SnapshotHistoryEntry[]; importedCaptures: number; importedEntries: number }> {
  const importedCaptures = Array.isArray(archive.captures) ? archive.captures.filter(isSnapshotCaptureRecord) : [];
  const importedEntries = Array.isArray(archive.entries) ? archive.entries.filter(isSnapshotHistoryEntry) : [];

  if (importedCaptures.length === 0 && importedEntries.length === 0) {
    return {
      captures: await readSnapshotCaptures(env),
      entries: await readSnapshotHistory(env),
      importedCaptures: 0,
      importedEntries: 0
    };
  }

  const current = await readSnapshotHistoryFile(env);
  const limits = getSnapshotHistoryLimits(env);
  const nextCaptures = dedupeCaptures([...importedCaptures, ...current.captures])
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
    .slice(0, limits.captureLimit);
  const nextEntries = dedupeHistoryEntries([
    ...importedEntries,
    ...importedCaptures.map((capture) => capture.summary),
    ...current.entries
  ])
    .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())
    .slice(0, limits.historyLimit);

  await writeSnapshotHistoryFile({ captures: nextCaptures, entries: nextEntries }, env);

  return {
    captures: nextCaptures,
    entries: nextEntries,
    importedCaptures: importedCaptures.length,
    importedEntries: importedEntries.length
  };
}

export function getSnapshotHistoryLimits(env: NodeJS.ProcessEnv = process.env): SnapshotHistoryLimits {
  return {
    captureLimit: parseBoundedLimit(env.WHOFI_SNAPSHOT_CAPTURE_LIMIT, defaultCaptureLimit, maxCaptureLimit),
    historyLimit: parseBoundedLimit(env.WHOFI_SNAPSHOT_HISTORY_LIMIT, defaultHistoryLimit, maxHistoryLimit)
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
  const next: SnapshotHistoryEntry = {
    ...entry,
    reviewedAt: update.reviewedAt
  };

  if ("reviewNote" in update) {
    next.reviewNote = update.reviewNote;
  }

  return next;
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

function parseBoundedLimit(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}
