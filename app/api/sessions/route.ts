import { NextRequest, NextResponse } from "next/server";
import {
  getLiveSourceAccessError,
  loadDeviceSnapshot,
  readDeviceSource,
  redactDeviceSourceError
} from "@/lib/device-snapshots";
import { buildSessionSnapshot } from "@/lib/session-rollups";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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
    const deviceSnapshot = await loadDeviceSnapshot(source);
    return NextResponse.json(buildSessionSnapshot(deviceSnapshot));
  } catch (error) {
    const message = error instanceof Error ? redactDeviceSourceError(error.message) : "Session snapshot failed";
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
