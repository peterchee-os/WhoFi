import { NextResponse } from "next/server";
import {
  getOmadaPrintingPressConfigFromEnv,
  listOmadaPrintingPressObservations
} from "@/lib/providers/omada-printing-press";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getOmadaPrintingPressConfigFromEnv();
    const result = await listOmadaPrintingPressObservations(config);

    return NextResponse.json({
      count: result.count,
      observations: result.observations,
      provider: {
        displayName: "Omada Printing Press",
        id: "omada-printing-press",
        type: "omada"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? redactCliError(error.message) : "Omada Printing Press test failed";
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

function redactCliError(value: string) {
  return value
    .replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/([A-Fa-f0-9]{2}[:-]){5}[A-Fa-f0-9]{2}/g, "[mac]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]");
}
