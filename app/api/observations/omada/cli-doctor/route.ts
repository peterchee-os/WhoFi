import { NextResponse } from "next/server";
import {
  doctorOmadaPrintingPress,
  getOmadaPrintingPressConfigFromEnv
} from "@/lib/providers/omada-printing-press";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getOmadaPrintingPressConfigFromEnv();
    const result = await doctorOmadaPrintingPress(config);

    return NextResponse.json(
      {
        provider: {
          displayName: "Omada Printing Press",
          id: "omada-printing-press",
          type: "omada"
        },
        result: sanitizeDoctorResult(result)
      },
      {
        status: result.status === "ok" ? 200 : 502
      }
    );
  } catch (error) {
    const message = error instanceof Error ? redactDoctorError(error.message) : "Omada Printing Press doctor failed";
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

function sanitizeDoctorResult(result: {
  checks: Array<{ detail?: string; name: string; status: string }>;
  live: boolean;
  status: string;
}) {
  return {
    checks: result.checks.map((check) => ({
      detail: check.detail ? redactDoctorError(check.detail) : undefined,
      name: check.name,
      status: check.status
    })),
    live: result.live,
    status: result.status
  };
}

function redactDoctorError(value: string) {
  return value
    .replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/([A-Fa-f0-9]{2}[:-]){5}[A-Fa-f0-9]{2}/g, "[mac]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]");
}
