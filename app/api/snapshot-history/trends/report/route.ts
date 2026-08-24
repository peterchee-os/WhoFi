import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import { buildSnapshotTrendReport } from "@/lib/snapshot-report";
import { readSnapshotReviewPolicy } from "@/lib/snapshot-review-policy-store";
import { readSnapshotHistory } from "@/lib/snapshot-history-store";
import { buildSnapshotTrends, type SnapshotTrendSourceFilter } from "@/lib/snapshot-trends";

export const runtime = "nodejs";

const sourceFilters = new Set<SnapshotTrendSourceFilter>(["all", "demo", "omada", "omada-pp"]);

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
        error: "Invalid snapshot trend source"
      },
      {
        status: 400
      }
    );
  }

  const [entries, policy] = await Promise.all([readSnapshotHistory(), readSnapshotReviewPolicy()]);
  const trends = buildSnapshotTrends(entries, policy, source);

  return new NextResponse(buildSnapshotTrendReport({ trends }), {
    headers: {
      "Content-Disposition": `attachment; filename="whofi-snapshot-trends-${source}.md"`,
      "Content-Type": "text/markdown; charset=utf-8"
    }
  });
}

function parseSourceFilter(value: string | null): SnapshotTrendSourceFilter | undefined {
  const candidate = value || "all";
  return sourceFilters.has(candidate as SnapshotTrendSourceFilter) ? (candidate as SnapshotTrendSourceFilter) : undefined;
}
