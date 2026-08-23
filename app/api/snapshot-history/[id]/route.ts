import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import { readSnapshotCapture } from "@/lib/snapshot-history-store";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const capture = await readSnapshotCapture(id);
  if (!capture) {
    return NextResponse.json(
      {
        error: "Snapshot capture not found"
      },
      {
        status: 404
      }
    );
  }

  return NextResponse.json({
    capture
  });
}
