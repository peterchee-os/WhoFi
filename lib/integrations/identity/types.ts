export type IdentityProviderType = "demo" | "csv" | "yardi" | "officernd" | "deskworks" | "coworks" | "nexudus";

export type IdentityProviderConfig = {
  id: string;
  type: IdentityProviderType;
  displayName: string;
};

export type ExternalCompany = {
  providerId: string;
  providerType: IdentityProviderType;
  externalId: string;
  displayName: string;
  status?: "active" | "inactive" | "unknown";
  locationRefs?: string[];
  raw?: unknown;
};

export type ExternalPerson = {
  providerId: string;
  providerType: IdentityProviderType;
  externalId: string;
  displayName: string;
  email?: string;
  companyExternalId?: string;
  status?: "active" | "inactive" | "unknown";
  profileHint?: "guest" | "event_attendee" | "drop_in" | "customer" | "staff" | "vendor" | "agent" | "machine" | "unknown";
  raw?: unknown;
};

export type ExternalEntitlement = {
  providerId: string;
  providerType: IdentityProviderType;
  externalId: string;
  personExternalId?: string;
  companyExternalId?: string;
  locationRef?: string;
  status: "active" | "inactive" | "unknown";
  startsAt?: string;
  endsAt?: string;
  raw?: unknown;
};

export type IdentityProviderSnapshot = {
  companies: ExternalCompany[];
  entitlements: ExternalEntitlement[];
  people: ExternalPerson[];
};

export type IdentityProvider = {
  readonly config: IdentityProviderConfig;
  getSnapshot(): Promise<IdentityProviderSnapshot>;
};
