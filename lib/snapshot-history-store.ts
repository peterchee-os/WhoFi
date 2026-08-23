import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DeviceSnapshot } from "./device-ledger";
import { createSnapshotHistoryEntry, type SnapshotHistoryEntry } from "./snapshot-history";

const defaultHistoryLimit = 100;

type SnapshotHistoryFile = {
  entries: SnapshotHistoryEntry[];
};

export async function appendSnapshotHistory(
  snapshot: DeviceSnapshot,
  env: NodeJS.ProcessEnv = process.env
): Promise<SnapshotHistoryEntry[]> {
  const entry = createSnapshotHistoryEntry(snapshot.source, snapshot.devices, snapshot.observedAt);
  const entries = await readSnapshotHistory(env);
  const nextEntries = dedupeHistoryEntries([entry, ...entries]).slice(0, defaultHistoryLimit);
  await writeSnapshotHistory(nextEntries, env);
  return nextEntries;
}

export async function readSnapshotHistory(env: NodeJS.ProcessEnv = process.env): Promise<SnapshotHistoryEntry[]> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ getSnapshotHistoryPath(env), "utf8");
    const parsed = JSON.parse(raw) as Partial<SnapshotHistoryFile> | SnapshotHistoryEntry[];
    const entries = Array.isArray(parsed) ? parsed : parsed.entries;
    return Array.isArray(entries) ? entries.filter(isSnapshotHistoryEntry) : [];
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function clearSnapshotHistory(env: NodeJS.ProcessEnv = process.env) {
  await writeSnapshotHistory([], env);
}

function getSnapshotHistoryPath(env: NodeJS.ProcessEnv) {
  return env.WHOFI_SNAPSHOT_HISTORY_PATH || join(process.cwd(), ".whofi", "snapshot-history.json");
}

async function writeSnapshotHistory(entries: SnapshotHistoryEntry[], env: NodeJS.ProcessEnv) {
  const filePath = getSnapshotHistoryPath(env);
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmpPath, `${JSON.stringify({ entries }, null, 2)}\n`, "utf8");
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
