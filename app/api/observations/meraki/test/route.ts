import { NextResponse } from "next/server";
import { getMerakiClientFromEnv, listMerakiObservations } from "@/lib/providers/meraki";

export async function GET() {
  try {
    const client = getMerakiClientFromEnv();
    const observations = await listMerakiObservations(client, {
      perPage: 100,
      timespanSeconds: 300
    });

    return NextResponse.json({
      count: observations.length,
      observations,
      provider: {
        displayName: client.config.displayName,
        id: client.config.id,
        networkId: client.config.networkId,
        organizationId: client.config.organizationId,
        type: client.config.type
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meraki test failed";
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
