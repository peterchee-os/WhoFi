import { NextResponse } from "next/server";
import { demoNetworkProvider } from "@/lib/providers/demo";

export async function GET() {
  const observations = await demoNetworkProvider.listObservations();

  return NextResponse.json({
    observations,
    provider: demoNetworkProvider.config
  });
}
