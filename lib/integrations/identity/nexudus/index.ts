import type { ExternalCompany, ExternalEntitlement, ExternalPerson, IdentityProviderConfig } from "../types";

export type NexudusProviderConfig = IdentityProviderConfig & {
  type: "nexudus";
  accountName?: string;
};

export type NexudusTeamSnapshot = {
  Id?: string | number;
  id?: string | number;
  Name?: string;
  name?: string;
  Status?: string;
  status?: string;
  LocationId?: string | number;
  locationId?: string | number;
};

export type NexudusCustomerSnapshot = {
  Id?: string | number;
  id?: string | number;
  FullName?: string;
  fullName?: string;
  Name?: string;
  name?: string;
  Email?: string;
  email?: string;
  TeamId?: string | number;
  teamId?: string | number;
  CompanyId?: string | number;
  companyId?: string | number;
  Status?: string;
  status?: string;
};

export type NexudusMembershipSnapshot = {
  Id?: string | number;
  id?: string | number;
  CustomerId?: string | number;
  customerId?: string | number;
  TeamId?: string | number;
  teamId?: string | number;
  CompanyId?: string | number;
  companyId?: string | number;
  LocationId?: string | number;
  locationId?: string | number;
  Status?: string;
  status?: string;
  StartDate?: string;
  startDate?: string;
  EndDate?: string;
  endDate?: string;
};

export function normalizeNexudusCompany(
  config: NexudusProviderConfig,
  snapshot: NexudusTeamSnapshot
): ExternalCompany | null {
  const externalId = String(snapshot.Id ?? snapshot.id ?? "");
  const displayName = snapshot.Name ?? snapshot.name;
  if (!externalId || !displayName) return null;

  return {
    displayName,
    externalId,
    locationRefs: snapshot.LocationId || snapshot.locationId ? [String(snapshot.LocationId ?? snapshot.locationId)] : undefined,
    providerId: config.id,
    providerType: "nexudus",
    raw: snapshot,
    status: normalizeStatus(snapshot.Status ?? snapshot.status)
  };
}

export function normalizeNexudusCustomer(
  config: NexudusProviderConfig,
  snapshot: NexudusCustomerSnapshot
): ExternalPerson | null {
  const externalId = String(snapshot.Id ?? snapshot.id ?? "");
  const displayName = snapshot.FullName ?? snapshot.fullName ?? snapshot.Name ?? snapshot.name;
  if (!externalId || !displayName) return null;

  return {
    companyExternalId: snapshot.TeamId || snapshot.teamId || snapshot.CompanyId || snapshot.companyId
      ? String(snapshot.TeamId ?? snapshot.teamId ?? snapshot.CompanyId ?? snapshot.companyId)
      : undefined,
    displayName,
    email: snapshot.Email ?? snapshot.email,
    externalId,
    profileHint: "customer",
    providerId: config.id,
    providerType: "nexudus",
    raw: snapshot,
    status: normalizeStatus(snapshot.Status ?? snapshot.status)
  };
}

export function normalizeNexudusMembership(
  config: NexudusProviderConfig,
  snapshot: NexudusMembershipSnapshot
): ExternalEntitlement | null {
  const externalId = String(snapshot.Id ?? snapshot.id ?? "");
  if (!externalId) return null;

  return {
    companyExternalId: snapshot.TeamId || snapshot.teamId || snapshot.CompanyId || snapshot.companyId
      ? String(snapshot.TeamId ?? snapshot.teamId ?? snapshot.CompanyId ?? snapshot.companyId)
      : undefined,
    endsAt: snapshot.EndDate ?? snapshot.endDate,
    externalId,
    locationRef: snapshot.LocationId || snapshot.locationId ? String(snapshot.LocationId ?? snapshot.locationId) : undefined,
    personExternalId: snapshot.CustomerId || snapshot.customerId ? String(snapshot.CustomerId ?? snapshot.customerId) : undefined,
    providerId: config.id,
    providerType: "nexudus",
    raw: snapshot,
    startsAt: snapshot.StartDate ?? snapshot.startDate,
    status: normalizeStatus(snapshot.Status ?? snapshot.status)
  };
}

function normalizeStatus(value?: string) {
  if (!value) return "unknown";
  return ["active", "current", "member", "confirmed"].includes(value.toLowerCase()) ? "active" : "inactive";
}
