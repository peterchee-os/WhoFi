import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import { buildSnapshotReviewQueue, buildSnapshotReviewQueueSummary } from "@/lib/snapshot-history";
import { readSnapshotReviewPolicy } from "@/lib/snapshot-review-policy-store";
import { readSnapshotHistory, updateSnapshotCaptureReviews } from "@/lib/snapshot-history-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const adminStatus = getAdminAuthStatus(request);
  if (!adminStatus.authenticated) {
    return NextResponse.json(
      {
        error: "Admin authentication required"
      },
      {
        status: adminStatus.configured ? 401 : 503
      }
    );
  }

  const [entries, policy] = await Promise.all([readSnapshotHistory(), readSnapshotReviewPolicy()]);
  const queue = buildSnapshotReviewQueue(entries, policy);

  return NextResponse.json({
    count: queue.length,
    policy,
    queue,
    summary: buildSnapshotReviewQueueSummary(entries, queue)
  });
}

export async function PATCH(request: NextRequest) {
  const adminStatus = getAdminAuthStatus(request);
  if (!adminStatus.authenticated) {
    return NextResponse.json(
      {
        error: "Admin authentication required"
      },
      {
        status: adminStatus.configured ? 401 : 503
      }
    );
  }

  const body = (await request.json().catch(() => undefined)) as
    | { ids?: unknown; reviewed?: unknown }
    | undefined;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];

  if (!body || ids.length === 0 || ids.length > 50 || typeof body.reviewed !== "boolean") {
    return NextResponse.json(
      {
        error: "Invalid review queue update"
      },
      {
        status: 400
      }
    );
  }

  const result = await updateSnapshotCaptureReviews(ids, {
    reviewedAt: body.reviewed ? new Date().toISOString() : undefined
  });
  const policy = await readSnapshotReviewPolicy();
  const queue = buildSnapshotReviewQueue(result.entries, policy);

  return NextResponse.json({
    count: queue.length,
    entries: result.entries,
    policy,
    queue,
    summary: buildSnapshotReviewQueueSummary(result.entries, queue),
    updatedIds: result.updatedIds
  });
}
