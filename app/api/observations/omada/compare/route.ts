import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import { getOmadaClientFromEnv, listOmadaObservations } from "@/lib/providers/omada";
import {
  getOmadaPrintingPressConfigFromEnv,
  listOmadaPrintingPressObservations
} from "@/lib/providers/omada-printing-press";

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

  const result = {
    cli: await countCliObservations(),
    match: false,
    typescript: await countTypescriptObservations()
  };

  result.match =
    result.cli.status === "success" &&
    result.typescript.status === "success" &&
    result.cli.count === result.typescript.count;

  return NextResponse.json(result, {
    status: result.cli.status === "success" || result.typescript.status === "success" ? 200 : 409
  });
}

async function countCliObservations() {
  try {
    const config = getOmadaPrintingPressConfigFromEnv();
    const result = await listOmadaPrintingPressObservations(config);
    return {
      count: result.count,
      status: "success" as const
    };
  } catch (error) {
    return {
      error: redactCompareError(error instanceof Error ? error.message : "Omada Printing Press comparison failed"),
      status: "error" as const
    };
  }
}

async function countTypescriptObservations() {
  try {
    const client = getOmadaClientFromEnv();
    const observations = await listOmadaObservations(client, {
      currentPage: 1,
      currentPageSize: 100
    });
    return {
      count: observations.length,
      status: "success" as const
    };
  } catch (error) {
    return {
      error: redactCompareError(error instanceof Error ? error.message : "Omada TypeScript comparison failed"),
      status: "error" as const
    };
  }
}

function redactCompareError(value: string) {
  return value
    .replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/([A-Fa-f0-9]{2}[:-]){5}[A-Fa-f0-9]{2}/g, "[mac]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]");
}
