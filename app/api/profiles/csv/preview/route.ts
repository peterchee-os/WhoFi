import { NextResponse } from "next/server";
import { parseCsvIdentitySnapshot, type CsvIdentityProviderConfig } from "@/lib/integrations/identity/csv";

const config: CsvIdentityProviderConfig = {
  displayName: "CSV / Manual Import",
  id: "csv-preview",
  type: "csv"
};

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const input = contentType.includes("application/json")
      ? String((await request.json()).input ?? "")
      : await request.text();

    if (!input.trim()) {
      return NextResponse.json(
        {
          error: "CSV input is required"
        },
        {
          status: 400
        }
      );
    }

    const snapshot = parseCsvIdentitySnapshot(config, input);

    return NextResponse.json({
      provider: config,
      snapshot,
      summary: {
        companies: snapshot.companies.length,
        entitlements: snapshot.entitlements.length,
        people: snapshot.people.length
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "CSV preview failed"
      },
      {
        status: 400
      }
    );
  }
}
