import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import { getSnapshotHistoryLimits, importSnapshotArchive } from "@/lib/snapshot-history-store";

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

  const body = (await request.json().catch(() => undefined)) as
    | { captures?: unknown; entries?: unknown; schema?: unknown }
    | undefined;
  if (!body || !isValidArchivePayload(body)) {
    return NextResponse.json(
      {
        error: "Invalid snapshot archive"
      },
      {
        status: 400
      }
    );
  }

  const result = await importSnapshotArchive(body);
  if (result.importedCaptures === 0 && result.importedEntries === 0) {
    return NextResponse.json(
      {
        error: "Snapshot archive has no importable captures or entries"
      },
      {
        status: 400
      }
    );
  }

  return NextResponse.json({
    ...result,
    limits: getSnapshotHistoryLimits()
  });
}

function isValidArchivePayload(value: { captures?: unknown; entries?: unknown; schema?: unknown }) {
  return (
    (value.schema === undefined || value.schema === "whofi.snapshot-archive.v1") &&
    (value.captures === undefined || Array.isArray(value.captures)) &&
    (value.entries === undefined || Array.isArray(value.entries))
  );
}
