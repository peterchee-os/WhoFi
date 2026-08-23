import type { ExternalCompany, ExternalEntitlement, ExternalPerson, IdentityProviderConfig } from "../types";

export type YardiProviderConfig = IdentityProviderConfig & {
  type: "yardi";
  propertyRef?: string;
};

export type YardiCompanySnapshot = {
  id?: string | number;
  code?: string;
  name?: string;
  status?: string;
  propertyId?: string | number;
};

export type YardiPersonSnapshot = {
  id?: string | number;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  companyId?: string | number;
  status?: string;
};

export function normalizeYardiCompany(config: YardiProviderConfig, snapshot: YardiCompanySnapshot): ExternalCompany | null {
  const externalId = String(snapshot.id ?? snapshot.code ?? "");
  if (!externalId || !snapshot.name) return null;

  return {
    displayName: snapshot.name,
    externalId,
    locationRefs: snapshot.propertyId ? [String(snapshot.propertyId)] : undefined,
    providerId: config.id,
    providerType: "yardi",
    raw: snapshot,
    status: normalizeStatus(snapshot.status)
  };
}

export function normalizeYardiPerson(config: YardiProviderConfig, snapshot: YardiPersonSnapshot): ExternalPerson | null {
  const externalId = String(snapshot.id ?? "");
  const displayName = snapshot.name ?? [snapshot.firstName, snapshot.lastName].filter(Boolean).join(" ");
  if (!externalId || !displayName) return null;

  return {
    companyExternalId: snapshot.companyId ? String(snapshot.companyId) : undefined,
    displayName,
    email: snapshot.email,
    externalId,
    profileHint: "customer",
    providerId: config.id,
    providerType: "yardi",
    raw: snapshot,
    status: normalizeStatus(snapshot.status)
  };
}

export function normalizeYardiEntitlement(
  config: YardiProviderConfig,
  input: {
    externalId: string;
    companyExternalId?: string;
    personExternalId?: string;
    propertyId?: string | number;
    status?: string;
    startsAt?: string;
    endsAt?: string;
    raw?: unknown;
  }
): ExternalEntitlement {
  return {
    companyExternalId: input.companyExternalId,
    endsAt: input.endsAt,
    externalId: input.externalId,
    locationRef: input.propertyId ? String(input.propertyId) : undefined,
    personExternalId: input.personExternalId,
    providerId: config.id,
    providerType: "yardi",
    raw: input.raw,
    startsAt: input.startsAt,
    status: normalizeStatus(input.status)
  };
}

function normalizeStatus(value?: string) {
  if (!value) return "unknown";
  return ["active", "current", "occupied"].includes(value.toLowerCase()) ? "active" : "inactive";
}

