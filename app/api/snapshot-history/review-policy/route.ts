import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import { normalizeSnapshotReviewPolicy, type SnapshotReviewPolicy } from "@/lib/snapshot-history";
import {
  readSnapshotReviewPolicy,
  resetSnapshotReviewPolicy,
  writeSnapshotReviewPolicy
} from "@/lib/snapshot-review-policy-store";

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

  return NextResponse.json({
    policy: await readSnapshotReviewPolicy()
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

  const body = (await request.json().catch(() => undefined)) as Partial<SnapshotReviewPolicy> | undefined;
  if (!body || !isValidPolicyPayload(body)) {
    return NextResponse.json(
      {
        error: "Invalid review policy"
      },
      {
        status: 400
      }
    );
  }

  return NextResponse.json({
    policy: await writeSnapshotReviewPolicy(normalizeSnapshotReviewPolicy(body))
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

  return NextResponse.json({
    policy: await resetSnapshotReviewPolicy()
  });
}

function isValidPolicyPayload(value: Partial<SnapshotReviewPolicy>) {
  return (
    isOptionalBoolean(value.triggerOnHighUsage) &&
    isOptionalBoolean(value.triggerOnReviewSignals) &&
    isOptionalBoolean(value.triggerOnUnknownDevices) &&
    isOptionalNumber(value.highUsageBytes) &&
    isOptionalNumber(value.reviewSignalThreshold) &&
    isOptionalNumber(value.unknownDeviceThreshold)
  );
}

function isOptionalBoolean(value: unknown) {
  return value === undefined || typeof value === "boolean";
}

function isOptionalNumber(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}
