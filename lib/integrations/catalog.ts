export type IntegrationCategory = "Network" | "Identity";

export type IntegrationStatus = "demo" | "shape_ready" | "planned";

export type IntegrationCatalogItem = {
  category: IntegrationCategory;
  description: string;
  id: string;
  liveTestPath?: string;
  name: string;
  status: IntegrationStatus;
  testPath?: string;
};

export const integrationCatalog: IntegrationCatalogItem[] = [
  {
    category: "Network",
    description: "Demo observations endpoint",
    id: "network-demo",
    name: "Demo Network",
    status: "demo",
    testPath: "/api/observations/demo"
  },
  {
    category: "Network",
    description: "Essentials/free client and usage data",
    id: "network-omada",
    name: "Omada",
    status: "shape_ready",
    testPath: "/api/observations/omada/shape"
  },
  {
    category: "Network",
    description: "Cloud-managed clients and usage data",
    id: "network-meraki",
    name: "Cisco Meraki",
    status: "shape_ready",
    testPath: "/api/observations/meraki/shape"
  },
  {
    category: "Identity",
    description: "Demo profile snapshot endpoint",
    id: "identity-demo",
    name: "Demo Identity",
    status: "demo",
    testPath: "/api/profiles/demo"
  },
  {
    category: "Identity",
    description: "Roster, guest list, and manual import source",
    id: "identity-csv",
    name: "CSV / Manual Import",
    status: "shape_ready",
    testPath: "/api/profiles/csv/shape"
  },
  {
    category: "Identity",
    description: "Property/customer entitlement source",
    id: "identity-yardi",
    name: "Yardi",
    status: "planned"
  },
  {
    category: "Identity",
    description: "Coworking member and company source",
    id: "identity-officernd",
    name: "OfficeRnD",
    status: "planned"
  },
  {
    category: "Identity",
    description: "Coworking member, plan, and usage source",
    id: "identity-deskworks",
    name: "Deskworks",
    status: "shape_ready",
    testPath: "/api/profiles/deskworks/shape"
  },
  {
    category: "Identity",
    description: "API-first member and location source",
    id: "identity-nexudus",
    name: "Nexudus",
    status: "shape_ready",
    testPath: "/api/profiles/nexudus/shape"
  }
];
