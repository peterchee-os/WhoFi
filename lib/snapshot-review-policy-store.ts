import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  defaultSnapshotReviewPolicy,
  normalizeSnapshotReviewPolicy,
  type SnapshotReviewPolicy
} from "./snapshot-history";

export async function readSnapshotReviewPolicy(env: NodeJS.ProcessEnv = process.env): Promise<SnapshotReviewPolicy> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ getSnapshotReviewPolicyPath(env), "utf8");
    return normalizeSnapshotReviewPolicy(JSON.parse(raw) as Partial<SnapshotReviewPolicy>);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return defaultSnapshotReviewPolicy;
    throw error;
  }
}

export async function writeSnapshotReviewPolicy(
  policy: Partial<SnapshotReviewPolicy>,
  env: NodeJS.ProcessEnv = process.env
): Promise<SnapshotReviewPolicy> {
  const nextPolicy = normalizeSnapshotReviewPolicy(policy);
  const filePath = getSnapshotReviewPolicyPath(env);
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmpPath, `${JSON.stringify(nextPolicy, null, 2)}\n`, "utf8");
  await rename(/* turbopackIgnore: true */ tmpPath, filePath);
  return nextPolicy;
}

export async function resetSnapshotReviewPolicy(env: NodeJS.ProcessEnv = process.env): Promise<SnapshotReviewPolicy> {
  return writeSnapshotReviewPolicy(defaultSnapshotReviewPolicy, env);
}

function getSnapshotReviewPolicyPath(env: NodeJS.ProcessEnv) {
  return env.WHOFI_SNAPSHOT_REVIEW_POLICY_PATH || join(process.cwd(), ".whofi", "snapshot-review-policy.json");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
