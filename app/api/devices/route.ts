import { NextRequest, NextResponse } from "next/server";
import {
  getLiveSourceAccessError,
  loadDeviceSnapshot,
  readDeviceSource,
  redactDeviceSourceError
} from "@/lib/device-snapshots";
import { getAdminAuthStatus } from "@/lib/admin-auth";

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
    return NextResponse.json(await loadDeviceSnapshot(source));
  } catch (error) {
    const message = error instanceof Error ? redactDeviceSourceError(error.message) : "Device snapshot failed";
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
