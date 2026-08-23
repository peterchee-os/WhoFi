import { NextResponse } from "next/server";
import {
  normalizeMerakiClientSnapshot,
  type MerakiProviderConfig
} from "@/lib/providers/meraki";

const config: MerakiProviderConfig = {
  displayName: "Cisco Meraki",
  id: "meraki-shape",
  networkId: "redmond-example",
  type: "meraki"
};

export async function GET() {
  const observation = normalizeMerakiClientSnapshot(config, {
    description: "example-laptop",
    ip: "192.0.2.90",
    lastSeen: 1787356800,
    mac: "02:11:22:33:44:90",
    recentDeviceName: "Redmond AP-01",
    ssid: "Guest WiFi",
    status: "Online",
    usage: {
      recv: 420,
      sent: 95
    }
  });

  return NextResponse.json({
    observations: observation ? [observation] : [],
    provider: config
  });
}
