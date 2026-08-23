import { NextResponse } from "next/server";
import { demoIdentityProvider } from "@/lib/integrations/identity/demo";

export async function GET() {
  const snapshot = await demoIdentityProvider.getSnapshot();

  return NextResponse.json({
    provider: demoIdentityProvider.config,
    snapshot
  });
}
