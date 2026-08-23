import { demoProfiles } from "@/lib/demo-data";
import type { ExternalCompany, ExternalPerson, IdentityProvider } from "../types";

export const demoIdentityProvider: IdentityProvider = {
  config: {
    displayName: "Demo Identity",
    id: "demo-identity",
    type: "demo"
  },
  async getSnapshot() {
    const people = demoProfiles.map(profileToPerson);
    const companies = buildDemoCompanies(people);

    return {
      companies,
      entitlements: [],
      people
    };
  }
};

function profileToPerson(profile: typeof demoProfiles[number]): ExternalPerson {
  return {
    companyExternalId: profile.organizationName ? organizationKey(profile.organizationName) : undefined,
    displayName: profile.displayName,
    email: profile.email,
    externalId: profile.id,
    profileHint: profile.profileType === "customer" ? "customer" : profile.profileType,
    providerId: demoIdentityProvider.config.id,
    providerType: demoIdentityProvider.config.type,
    raw: {
      demoProfileId: profile.id,
      profileLevel: profile.profileLevel
    },
    status: "active"
  };
}

function buildDemoCompanies(people: ExternalPerson[]): ExternalCompany[] {
  const names = new Map<string, string>();

  for (const profile of demoProfiles) {
    if (!profile.organizationName) continue;
    names.set(organizationKey(profile.organizationName), profile.organizationName);
  }

  return Array.from(names.entries()).map(([externalId, displayName]) => ({
    displayName,
    externalId,
    providerId: demoIdentityProvider.config.id,
    providerType: demoIdentityProvider.config.type,
    raw: {
      people: people.filter((person) => person.companyExternalId === externalId).map((person) => person.externalId)
    },
    status: "active"
  }));
}

function organizationKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
