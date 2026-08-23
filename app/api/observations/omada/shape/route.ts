import { NextResponse } from "next/server";
import {
  normalizeOmadaClientSnapshot,
  type OmadaProviderConfig
} from "@/lib/providers/omada";

const config: OmadaProviderConfig = {
  displayName: "Omada",
  id: "omada-shape",
  serviceTier: "essentials",
  siteId: "seattle-example",
  siteName: "Seattle",
  type: "omada"
};

export async function GET() {
  const observation = normalizeOmadaClientSnapshot(config, {
    apName: "Seattle AP-01",
    clientName: "example-laptop",
    downloadByte: 830_000_000,
    ipAddress: "192.0.2.44",
    lastSeen: 1787356800,
    mac: "02:aa:bb:cc:dd:44",
    ssid: "Guest WiFi",
    status: "CONNECTED",
    uploadByte: 125_000_000
  });

  return NextResponse.json({
    observations: observation ? [observation] : [],
    provider: config
  });
}
