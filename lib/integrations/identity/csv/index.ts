import type { ExternalCompany, ExternalPerson, IdentityProviderSnapshot, IdentityProviderConfig } from "../types";

export type CsvIdentityProviderConfig = IdentityProviderConfig & {
  type: "csv";
};

export type CsvIdentityRow = {
  company?: string;
  email?: string;
  externalId?: string;
  name?: string;
  organization?: string;
  profileType?: string;
  status?: string;
  team?: string;
};

export function parseCsvIdentitySnapshot(
  config: CsvIdentityProviderConfig,
  input: string
): IdentityProviderSnapshot {
  const rows = parseDelimitedRows(input).map(normalizeRow).filter((row) => row.name || row.email || row.company || row.organization);
  const people = rows.map((row, index) => normalizeCsvPerson(config, row, index)).filter((person): person is ExternalPerson => Boolean(person));
  const companies = normalizeCsvCompanies(config, rows);

  return {
    companies,
    entitlements: [],
    people
  };
}

export function normalizeCsvPerson(
  config: CsvIdentityProviderConfig,
  row: CsvIdentityRow,
  index: number
): ExternalPerson | null {
  const displayName = row.name ?? row.email;
  if (!displayName) return null;

  const companyName = row.company ?? row.organization ?? row.team;

  return {
    companyExternalId: companyName ? companyKey(companyName) : undefined,
    displayName,
    email: row.email,
    externalId: row.externalId ?? row.email ?? `csv-person-${index + 1}`,
    profileHint: normalizeProfileHint(row.profileType),
    providerId: config.id,
    providerType: "csv",
    raw: row,
    status: normalizeStatus(row.status)
  };
}

function normalizeCsvCompanies(config: CsvIdentityProviderConfig, rows: CsvIdentityRow[]): ExternalCompany[] {
  const companies = new Map<string, string>();

  for (const row of rows) {
    const companyName = row.company ?? row.organization ?? row.team;
    if (!companyName) continue;
    companies.set(companyKey(companyName), companyName);
  }

  return Array.from(companies.entries()).map(([externalId, displayName]) => ({
    displayName,
    externalId,
    providerId: config.id,
    providerType: "csv",
    raw: {
      source: "csv"
    },
    status: "active"
  }));
}

function parseDelimitedRows(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const delimiter = trimmed.includes("\t") ? "\t" : ",";
  const records = parseRecords(trimmed, delimiter);
  const [headers = [], ...rows] = records;
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));

  return rows.map((row) => {
    const entry: Record<string, string> = {};
    normalizedHeaders.forEach((header, index) => {
      entry[header] = row[index]?.trim() ?? "";
    });
    return entry;
  });
}

function parseRecords(input: string, delimiter: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  rows.push(row);
  return rows.filter((record) => record.some((value) => value.trim()));
}

function normalizeRow(row: Record<string, string>): CsvIdentityRow {
  return {
    company: row.company,
    email: row.email,
    externalId: row.externalid ?? row.id,
    name: row.name ?? row.fullname ?? row.full_name,
    organization: row.organization ?? row.organisation,
    profileType: row.profiletype ?? row.profile_type ?? row.type,
    status: row.status,
    team: row.team
  };
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "");
}

function normalizeProfileHint(value?: string) {
  const normalized = value?.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (
    normalized === "guest" ||
    normalized === "event_attendee" ||
    normalized === "drop_in" ||
    normalized === "customer" ||
    normalized === "staff" ||
    normalized === "vendor" ||
    normalized === "agent" ||
    normalized === "machine"
  ) {
    return normalized;
  }
  return "unknown";
}

function normalizeStatus(value?: string) {
  if (!value) return "unknown";
  return ["active", "current", "confirmed", "registered", "checked_in"].includes(value.toLowerCase()) ? "active" : "inactive";
}

function companyKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
