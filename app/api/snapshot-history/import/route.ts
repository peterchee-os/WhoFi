import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import {
  getSnapshotHistoryLimits,
  importSnapshotArchive,
  validateSnapshotArchiveImport
} from "@/lib/snapshot-history-store";

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

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
  const summary = dryRun ? await validateSnapshotArchiveImport(body) : undefined;
  const result = dryRun ? undefined : await importSnapshotArchive(body);
  const importableCaptures = summary?.importableCaptures ?? result?.importedCaptures ?? 0;
  const importableEntries = summary?.importableEntries ?? result?.importedEntries ?? 0;

  if (importableCaptures === 0 && importableEntries === 0) {
    return NextResponse.json(
      {
        error: "Snapshot archive has no importable captures or entries",
        summary
      },
      {
        status: 400
      }
    );
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      limits: getSnapshotHistoryLimits(),
      summary
    });
  }

  if (!result) {
    return NextResponse.json(
      {
        error: "Snapshot archive import failed"
      },
      {
        status: 500
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
