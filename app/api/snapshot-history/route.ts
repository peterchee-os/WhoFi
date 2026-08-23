import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import { clearSnapshotHistory, readSnapshotCaptures, readSnapshotHistory } from "@/lib/snapshot-history-store";

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
    entries
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
    entries: []
  });
}
