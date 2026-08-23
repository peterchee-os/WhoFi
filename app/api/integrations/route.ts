import { NextResponse } from "next/server";
import { integrationCatalog } from "@/lib/integrations/catalog";

export async function GET() {
  return NextResponse.json({
    integrations: integrationCatalog
  });
}
