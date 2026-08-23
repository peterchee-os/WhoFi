import { NextResponse } from "next/server";
import { getNetworkProviderConfigStatus } from "@/lib/providers/config-status";

export async function GET() {
  return NextResponse.json({
    providers: getNetworkProviderConfigStatus()
  });
}
