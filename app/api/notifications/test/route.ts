import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthStatus } from "@/lib/admin-auth";

type ProviderMode = "disabled" | "console" | "resend";
type DeliveryStatus = "sent" | "failed" | "disabled" | "rendered";

type TestNotificationRequest = {
  providerMode?: ProviderMode;
  recipient?: string;
  fromEmail?: string;
  fromName?: string;
  replyToEmail?: string;
};

type TestNotificationResponse = {
  delivery: {
    id: string;
    notificationType: "test_email";
    recipient: string;
    provider: ProviderMode;
    status: DeliveryStatus;
    providerMessageId?: string;
    error?: string;
    createdAt: string;
  };
};

export async function POST(request: NextRequest) {
  const adminStatus = getAdminAuthStatus(request);
  if (!adminStatus.authenticated) {
    return NextResponse.json(
      {
        error: "Admin authentication required"
      },
      {
        status: adminStatus.configured ? 401 : 503
      }
    );
  }

  const body = (await request.json().catch(() => ({}))) as TestNotificationRequest;
  const providerMode = body.providerMode ?? "disabled";
  const recipient = body.recipient?.trim() || "none";
  const createdAt = new Date().toISOString();

  if (!body.recipient?.trim()) {
    return NextResponse.json(
      createResponse({
        createdAt,
        error: "No test recipient configured",
        provider: providerMode,
        recipient,
        status: "failed"
      }),
      { status: 400 }
    );
  }

  if (providerMode === "disabled") {
    return NextResponse.json(
      createResponse({
        createdAt,
        error: "Email delivery is disabled",
        provider: providerMode,
        recipient,
        status: "disabled"
      })
    );
  }

  if (providerMode === "console") {
    return NextResponse.json(
      createResponse({
        createdAt,
        provider: providerMode,
        providerMessageId: `console_${crypto.randomUUID()}`,
        recipient,
        status: "rendered"
      })
    );
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      createResponse({
        createdAt,
        error: "Resend API key is not configured",
        provider: providerMode,
        recipient,
        status: "failed"
      }),
      { status: 400 }
    );
  }

  return NextResponse.json(
    createResponse({
      createdAt,
      error: "Resend adapter is not enabled in this demo build",
      provider: providerMode,
      recipient,
      status: "failed"
    }),
    { status: 501 }
  );
}

function createResponse({
  createdAt,
  error,
  provider,
  providerMessageId,
  recipient,
  status
}: Omit<TestNotificationResponse["delivery"], "id" | "notificationType">): TestNotificationResponse {
  return {
    delivery: {
      createdAt,
      error,
      id: crypto.randomUUID(),
      notificationType: "test_email",
      provider,
      providerMessageId,
      recipient,
      status
    }
  };
}
