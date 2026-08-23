import { NextRequest, NextResponse } from "next/server";
import {
  adminSessionCookieName,
  createAdminSession,
  getAdminAuthStatus,
  getAdminSessionMaxAgeSeconds,
  verifyAdminPassword
} from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const status = getAdminAuthStatus(request);

  if (!status.enabled) {
    return NextResponse.json(status);
  }

  if (!status.configured) {
    return NextResponse.json(
      {
        ...status,
        error: "Admin auth is enabled but WHOFI_ADMIN_PASSWORD is not configured"
      },
      {
        status: 503
      }
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (!verifyAdminPassword(password)) {
    return NextResponse.json(
      {
        authenticated: false,
        configured: true,
        enabled: true,
        error: "Invalid admin password"
      },
      {
        status: 401
      }
    );
  }

  const response = NextResponse.json({
    authenticated: true,
    configured: true,
    enabled: true
  });
  response.cookies.set(adminSessionCookieName, createAdminSession(), {
    httpOnly: true,
    maxAge: getAdminSessionMaxAgeSeconds(),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}
