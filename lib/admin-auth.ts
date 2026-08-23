import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const adminSessionCookieName = "whofi_admin_session";

const sessionTtlMs = 12 * 60 * 60 * 1000;

export type AdminAuthStatus = {
  authenticated: boolean;
  configured: boolean;
  enabled: boolean;
};

export function getAdminAuthStatus(request: NextRequest, env: NodeJS.ProcessEnv = process.env): AdminAuthStatus {
  const enabled = isAdminAuthEnabled(env);
  const configured = Boolean(getAdminPassword(env));

  if (!enabled) {
    return {
      authenticated: true,
      configured,
      enabled
    };
  }

  return {
    authenticated: configured && verifyAdminSession(request.cookies.get(adminSessionCookieName)?.value, env),
    configured,
    enabled
  };
}

export function isAdminAuthEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.WHOFI_REQUIRE_ADMIN_AUTH === "true";
}

export function verifyAdminPassword(password: string, env: NodeJS.ProcessEnv = process.env) {
  const expectedPassword = getAdminPassword(env);
  if (!expectedPassword) return false;
  return constantTimeEqual(password, expectedPassword);
}

export function createAdminSession(env: NodeJS.ProcessEnv = process.env) {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${signAdminSession(issuedAt, env)}`;
}

export function verifyAdminSession(value: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  if (!value) return false;

  const [issuedAt, signature] = value.split(".");
  const issuedAtMs = Number(issuedAt);
  if (!issuedAt || !signature || !Number.isFinite(issuedAtMs)) return false;
  if (Date.now() - issuedAtMs > sessionTtlMs) return false;

  return constantTimeEqual(signature, signAdminSession(issuedAt, env));
}

export function getAdminSessionMaxAgeSeconds() {
  return Math.floor(sessionTtlMs / 1000);
}

function getAdminPassword(env: NodeJS.ProcessEnv) {
  return env.WHOFI_ADMIN_PASSWORD?.trim();
}

function getAdminSessionSecret(env: NodeJS.ProcessEnv) {
  return env.WHOFI_ADMIN_SESSION_SECRET?.trim() || getAdminPassword(env) || "";
}

function signAdminSession(issuedAt: string, env: NodeJS.ProcessEnv) {
  return createHmac("sha256", getAdminSessionSecret(env)).update(issuedAt).digest("hex");
}

function constantTimeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
