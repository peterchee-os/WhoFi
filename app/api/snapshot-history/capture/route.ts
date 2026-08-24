import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import {
  getLiveSourceAccessError,
  loadDeviceSnapshot,
  readDeviceSource,
  redactDeviceSourceError
} from "@/lib/device-snapshots";
import { appendSnapshotHistory, getSnapshotHistoryLimits } from "@/lib/snapshot-history-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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

  const source = readDeviceSource(request.nextUrl.searchParams.get("source"));
  const accessError = getLiveSourceAccessError(source, request.headers);

  if (accessError) {
    return NextResponse.json(
      {
        error: accessError.error,
        source
      },
      {
        status: accessError.status
      }
    );
  }

  try {
    const snapshot = await loadDeviceSnapshot(source);
    const snapshotHistory = await appendSnapshotHistory(snapshot);
    return NextResponse.json({
      limits: getSnapshotHistoryLimits(),
      ...snapshot,
      snapshotHistory
    });
  } catch (error) {
    const message = error instanceof Error ? redactDeviceSourceError(error.message) : "Snapshot capture failed";
    const status = message.includes("required") ? 409 : 502;

    return NextResponse.json(
      {
        error: message,
        source
      },
      {
        status
      }
    );
  }
}
