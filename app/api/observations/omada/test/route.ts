import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";
import { getOmadaClientFromEnv, listOmadaObservations } from "@/lib/providers/omada";

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

  try {
    const client = getOmadaClientFromEnv();
    const observations = await listOmadaObservations(client, {
      currentPage: 1,
      currentPageSize: 100
    });

    return NextResponse.json({
      count: observations.length,
      observations,
      provider: {
        displayName: client.config.displayName,
        id: client.config.id,
        serviceTier: client.config.serviceTier,
        siteId: client.config.siteId,
        siteName: client.config.siteName,
        type: client.config.type
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Omada test failed";
    const status = message.includes("required") ? 409 : 502;

    return NextResponse.json(
      {
        error: message
      },
      {
        status
      }
    );
  }
}
