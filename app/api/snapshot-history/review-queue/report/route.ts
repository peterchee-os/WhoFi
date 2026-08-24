import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import { buildSnapshotReviewQueue } from "@/lib/snapshot-history";
import { buildSnapshotReviewQueueReport } from "@/lib/snapshot-report";
import { readSnapshotHistory } from "@/lib/snapshot-history-store";
import type { DeviceSource } from "@/lib/device-ledger";
import type { SnapshotReviewQueueItem } from "@/lib/snapshot-history";

export const runtime = "nodejs";

type SourceFilter = "all" | DeviceSource;
type SeverityFilter = "all" | SnapshotReviewQueueItem["severity"];

const sourceFilters = new Set<SourceFilter>(["all", "demo", "omada", "omada-pp"]);
const severityFilters = new Set<SeverityFilter>(["all", "warning", "watch"]);

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
  const severity = parseSeverityFilter(request.nextUrl.searchParams.get("severity"));
  if (!source || !severity) {
    return NextResponse.json(
      {
        error: "Invalid review queue report filter"
      },
      {
        status: 400
      }
    );
  }

  const entries = await readSnapshotHistory();
  const allQueue = buildSnapshotReviewQueue(entries);
  const queue = allQueue.filter((item) => {
    const sourceMatch = source === "all" || item.source === source;
    const severityMatch = severity === "all" || item.severity === severity;
    return sourceMatch && severityMatch;
  });
  const summary = {
    open: allQueue.length,
    reviewed: entries.filter((entry) => Boolean(entry.reviewedAt)).length,
    total: entries.length,
    warning: allQueue.filter((item) => item.severity === "warning").length,
    watch: allQueue.filter((item) => item.severity === "watch").length
  };

  return new NextResponse(
    buildSnapshotReviewQueueReport({
      queue,
      severityFilter: severity,
      sourceFilter: source,
      summary
    }),
    {
      headers: {
        "Content-Disposition": `attachment; filename="whofi-review-queue-${source}-${severity}.md"`,
        "Content-Type": "text/markdown; charset=utf-8"
      }
    }
  );
}

function parseSourceFilter(value: string | null): SourceFilter | undefined {
  const candidate = value || "all";
  return sourceFilters.has(candidate as SourceFilter) ? (candidate as SourceFilter) : undefined;
}

function parseSeverityFilter(value: string | null): SeverityFilter | undefined {
  const candidate = value || "all";
  return severityFilters.has(candidate as SeverityFilter) ? (candidate as SeverityFilter) : undefined;
}
