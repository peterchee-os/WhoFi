import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import type { DeviceSource } from "@/lib/device-ledger";
import {
  buildSnapshotReviewQueue,
  buildSnapshotReviewQueueSummary
} from "@/lib/snapshot-history";
import { readSnapshotCaptures, readSnapshotHistory } from "@/lib/snapshot-history-store";
import { readSnapshotReviewPolicy } from "@/lib/snapshot-review-policy-store";
import { buildSnapshotTrends, type SnapshotTrendSourceFilter } from "@/lib/snapshot-trends";

export const runtime = "nodejs";

type SourceFilter = "all" | DeviceSource;

const sourceFilters = new Set<SourceFilter>(["all", "demo", "omada", "omada-pp"]);

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

  const source = parseSourceFilter(request.nextUrl.searchParams.get("source"));
  if (!source) {
    return NextResponse.json(
      {
        error: "Invalid snapshot archive source"
      },
      {
        status: 400
      }
    );
  }

  const [entries, captures, policy] = await Promise.all([
    readSnapshotHistory(),
    readSnapshotCaptures(),
    readSnapshotReviewPolicy()
  ]);
  const filteredEntries = source === "all" ? entries : entries.filter((entry) => entry.source === source);
  const filteredCaptures = source === "all" ? captures : captures.filter((capture) => capture.summary.source === source);
  const reviewQueue = buildSnapshotReviewQueue(filteredEntries, policy);

  return NextResponse.json(
    {
      captures: filteredCaptures,
      entries: filteredEntries,
      exportedAt: new Date().toISOString(),
      policy,
      reviewQueue: {
        items: reviewQueue,
        summary: buildSnapshotReviewQueueSummary(filteredEntries, reviewQueue)
      },
      schema: "whofi.snapshot-archive.v1",
      source,
      trends: buildSnapshotTrends(filteredEntries, policy, source as SnapshotTrendSourceFilter)
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="whofi-snapshot-archive-${source}.json"`
      }
    }
  );
}

function parseSourceFilter(value: string | null): SourceFilter | undefined {
  const candidate = value || "all";
  return sourceFilters.has(candidate as SourceFilter) ? (candidate as SourceFilter) : undefined;
}
