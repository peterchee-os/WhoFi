import type { ExternalCompany, ExternalEntitlement, ExternalPerson, IdentityProviderConfig } from "../types";

export type OfficeRnDProviderConfig = IdentityProviderConfig & {
  type: "officernd";
  org?: string;
};

export type OfficeRnDMemberSnapshot = {
  _id?: string;
  id?: string;
  name?: string;
  fullName?: string;
  email?: string;
  company?: string | { _id?: string; id?: string; name?: string };
  status?: string;
};

export type OfficeRnDCompanySnapshot = {
  _id?: string;
  id?: string;
  name?: string;
  status?: string;
};

export function normalizeOfficeRnDCompany(
  config: OfficeRnDProviderConfig,
  snapshot: OfficeRnDCompanySnapshot
): ExternalCompany | null {
  const externalId = snapshot._id ?? snapshot.id;
  if (!externalId || !snapshot.name) return null;

  return {
    displayName: snapshot.name,
    externalId,
    providerId: config.id,
    providerType: "officernd",
    raw: snapshot,
    status: normalizeStatus(snapshot.status)
  };
}

export function normalizeOfficeRnDMember(
  config: OfficeRnDProviderConfig,
  snapshot: OfficeRnDMemberSnapshot
): ExternalPerson | null {
  const externalId = snapshot._id ?? snapshot.id;
  const displayName = snapshot.fullName ?? snapshot.name;
  if (!externalId || !displayName) return null;

  return {
    companyExternalId: typeof snapshot.company === "string" ? snapshot.company : snapshot.company?._id ?? snapshot.company?.id,
    displayName,
    email: snapshot.email,
    externalId,
    profileHint: "customer",
    providerId: config.id,
    providerType: "officernd",
    raw: snapshot,
    status: normalizeStatus(snapshot.status)
  };
}

export function normalizeOfficeRnDEntitlement(
  config: OfficeRnDProviderConfig,
  input: {
    externalId: string;
    companyExternalId?: string;
    personExternalId?: string;
    locationRef?: string;
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
    locationRef: input.locationRef,
    personExternalId: input.personExternalId,
    providerId: config.id,
    providerType: "officernd",
    raw: input.raw,
    startsAt: input.startsAt,
    status: normalizeStatus(input.status)
  };
}

function normalizeStatus(value?: string) {
  if (!value) return "unknown";
  return ["active", "member", "customer"].includes(value.toLowerCase()) ? "active" : "inactive";
}

