import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import {
  deleteSnapshotCapture,
  readSnapshotCaptureDetail,
  updateSnapshotCaptureReview
} from "@/lib/snapshot-history-store";

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
  const detail = await readSnapshotCaptureDetail(id);
  if (!detail) {
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
    ...detail
  });
}

export async function PATCH(
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
  const detail = await readSnapshotCaptureDetail(id);
  if (!detail) {
    return NextResponse.json(
      {
        error: "Snapshot capture not found"
      },
      {
        status: 404
      }
    );
  }

  const body = (await request.json().catch(() => undefined)) as
    | { reviewNote?: unknown; reviewed?: unknown }
    | undefined;
  const invalidNote = body?.reviewNote !== undefined && typeof body.reviewNote !== "string";
  const invalidReviewed = body?.reviewed !== undefined && typeof body.reviewed !== "boolean";

  if (!body || invalidNote || invalidReviewed) {
    return NextResponse.json(
      {
        error: "Invalid review update"
      },
      {
        status: 400
      }
    );
  }

  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim() || undefined : undefined;
  const reviewedAt =
    body.reviewed === undefined ? detail.capture.summary.reviewedAt : body.reviewed ? new Date().toISOString() : undefined;
  const updated = await updateSnapshotCaptureReview(id, {
    reviewNote,
    reviewedAt
  });

  return NextResponse.json(updated);
}

export async function DELETE(
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
  const result = await deleteSnapshotCapture(id);
  if (!result.deleted) {
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
    entries: result.entries
  });
}
