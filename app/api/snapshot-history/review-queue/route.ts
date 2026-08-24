import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import { buildSnapshotReviewQueue, buildSnapshotReviewQueueSummary } from "@/lib/snapshot-history";
import { readSnapshotHistory } from "@/lib/snapshot-history-store";

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

  const entries = await readSnapshotHistory();
  const queue = buildSnapshotReviewQueue(entries);

  return NextResponse.json({
    count: queue.length,
    queue,
    summary: buildSnapshotReviewQueueSummary(entries, queue)
  });
}
