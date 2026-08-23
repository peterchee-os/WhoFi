import { NextResponse } from "next/server";
import { demoDevices, demoProfiles } from "@/lib/demo-data";
import { resolveDevices } from "@/lib/resolution";

export async function GET() {
  return NextResponse.json({
    resolutions: resolveDevices(demoDevices, demoProfiles)
  });
}
