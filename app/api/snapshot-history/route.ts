import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import {
  clearSnapshotHistory,
  getSnapshotHistoryLimits,
  pruneSnapshotHistory,
  readSnapshotCaptures,
  readSnapshotHistory
} from "@/lib/snapshot-history-store";

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
  const includeCaptures = request.nextUrl.searchParams.get("include") === "captures";

  return NextResponse.json({
    captures: includeCaptures ? await readSnapshotCaptures() : undefined,
    entries,
    limits: getSnapshotHistoryLimits()
  });
}

export async function DELETE(request: NextRequest) {
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

  await clearSnapshotHistory();
  return NextResponse.json({
    entries: [],
    limits: getSnapshotHistoryLimits()
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

  const body = (await request.json().catch(() => undefined)) as { action?: unknown } | undefined;
  if (body?.action !== "prune") {
    return NextResponse.json(
      {
        error: "Invalid snapshot history action"
      },
      {
        status: 400
      }
    );
  }

  const result = await pruneSnapshotHistory();

  return NextResponse.json({
    ...result,
    limits: getSnapshotHistoryLimits()
  });
}
