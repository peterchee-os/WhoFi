import type { ExternalCompany, ExternalEntitlement, ExternalPerson, IdentityProviderConfig } from "../types";

export type DeskworksProviderConfig = IdentityProviderConfig & {
  type: "deskworks";
  baseUrl?: string;
};

export type DeskworksAccountSnapshot = {
  id?: string | number;
  accountId?: string | number;
  name?: string;
  companyName?: string;
  status?: string;
  locationId?: string | number;
};

export type DeskworksMemberSnapshot = {
  id?: string | number;
  memberId?: string | number;
  name?: string;
  fullName?: string;
  email?: string;
  accountId?: string | number;
  companyId?: string | number;
  status?: string;
};

export type DeskworksPlanSnapshot = {
  id?: string | number;
  planId?: string | number;
  accountId?: string | number;
  memberId?: string | number;
  locationId?: string | number;
  status?: string;
  startDate?: string;
  endDate?: string;
};

export function normalizeDeskworksAccount(
  config: DeskworksProviderConfig,
  snapshot: DeskworksAccountSnapshot
): ExternalCompany | null {
  const externalId = String(snapshot.accountId ?? snapshot.id ?? "");
  const displayName = snapshot.companyName ?? snapshot.name;
  if (!externalId || !displayName) return null;

  return {
    displayName,
    externalId,
    locationRefs: snapshot.locationId ? [String(snapshot.locationId)] : undefined,
    providerId: config.id,
    providerType: "deskworks",
    raw: snapshot,
    status: normalizeStatus(snapshot.status)
  };
}

export function normalizeDeskworksMember(
  config: DeskworksProviderConfig,
  snapshot: DeskworksMemberSnapshot
): ExternalPerson | null {
  const externalId = String(snapshot.memberId ?? snapshot.id ?? "");
  const displayName = snapshot.fullName ?? snapshot.name;
  if (!externalId || !displayName) return null;

  return {
    companyExternalId: snapshot.accountId || snapshot.companyId ? String(snapshot.accountId ?? snapshot.companyId) : undefined,
    displayName,
    email: snapshot.email,
    externalId,
    profileHint: "customer",
    providerId: config.id,
    providerType: "deskworks",
    raw: snapshot,
    status: normalizeStatus(snapshot.status)
  };
}

export function normalizeDeskworksEntitlement(
  config: DeskworksProviderConfig,
  snapshot: DeskworksPlanSnapshot
): ExternalEntitlement | null {
  const externalId = String(snapshot.planId ?? snapshot.id ?? "");
  if (!externalId) return null;

  return {
    companyExternalId: snapshot.accountId ? String(snapshot.accountId) : undefined,
    endsAt: snapshot.endDate,
    externalId,
    locationRef: snapshot.locationId ? String(snapshot.locationId) : undefined,
    personExternalId: snapshot.memberId ? String(snapshot.memberId) : undefined,
    providerId: config.id,
    providerType: "deskworks",
    raw: snapshot,
    startsAt: snapshot.startDate,
    status: normalizeStatus(snapshot.status)
  };
}

function normalizeStatus(value?: string) {
  if (!value) return "unknown";
  return ["active", "current", "member", "customer", "in good standing"].includes(value.toLowerCase())
    ? "active"
    : "inactive";
}
