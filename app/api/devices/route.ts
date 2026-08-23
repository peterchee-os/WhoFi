import { NextRequest, NextResponse } from "next/server";
import {
  buildDemoDeviceSnapshot,
  buildDeviceSnapshotFromObservations,
  type DeviceSource
} from "@/lib/device-ledger";
import { getOmadaClientFromEnv, listOmadaObservations } from "@/lib/providers/omada";
import {
  getOmadaPrintingPressConfigFromEnv,
  listOmadaPrintingPressObservations
} from "@/lib/providers/omada-printing-press";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const source = readSource(request);

  try {
    if (source === "demo") {
      return NextResponse.json(buildDemoDeviceSnapshot());
    }

    if (source === "omada") {
      const client = getOmadaClientFromEnv();
      const observations = await listOmadaObservations(client, {
        currentPage: 1,
        currentPageSize: 100
      });
      return NextResponse.json(buildDeviceSnapshotFromObservations(source, observations));
    }

    const config = getOmadaPrintingPressConfigFromEnv();
    const result = await listOmadaPrintingPressObservations(config);
    return NextResponse.json(buildDeviceSnapshotFromObservations(source, result.observations));
  } catch (error) {
    const message = error instanceof Error ? redactDeviceSourceError(error.message) : "Device snapshot failed";
    const status = message.includes("required") ? 409 : 502;

    return NextResponse.json(
      {
        error: message,
        source
      },
      {
        status
      }
    );
  }
}

function readSource(request: NextRequest): DeviceSource {
  const value = request.nextUrl.searchParams.get("source");
  if (value === "omada" || value === "omada-pp") return value;
  return "demo";
}

function redactDeviceSourceError(value: string) {
  return value
    .replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/([A-Fa-f0-9]{2}[:-]){5}[A-Fa-f0-9]{2}/g, "[mac]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]");
}
