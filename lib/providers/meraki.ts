import type { NetworkObservation, NetworkProviderConfig } from "./types";

export type MerakiProviderConfig = NetworkProviderConfig & {
  type: "meraki";
  baseUrl?: string;
  organizationId?: string;
  networkId?: string;
};

export type MerakiClientQuery = {
  perPage?: number;
  timespanSeconds?: number;
};

export type MerakiClient = {
  apiKey: string;
  config: MerakiProviderConfig;
};

export type MerakiClientSnapshot = {
  id?: string;
  mac?: string;
  ip?: string;
  description?: string;
  firstSeen?: number;
  lastSeen?: number;
  manufacturer?: string;
  os?: string;
  user?: string;
  vlan?: string;
  ssid?: string;
  status?: "Offline" | "Online" | string;
  usage?: {
    sent?: number;
    recv?: number;
  };
  recentDeviceMac?: string;
  recentDeviceName?: string;
  recentDeviceSerial?: string;
  recentDeviceConnection?: "Wired" | "Wireless" | string;
  notes?: string;
  pskGroup?: string;
};

export function normalizeMerakiClientSnapshot(
  config: MerakiProviderConfig,
  snapshot: MerakiClientSnapshot,
  observedAt = new Date().toISOString()
): NetworkObservation | null {
  if (!snapshot.mac) return null;

  return {
    apName: snapshot.recentDeviceName ?? snapshot.recentDeviceSerial ?? snapshot.recentDeviceMac,
    eventType: snapshot.status === "Offline" ? "client_disconnected" : "client_seen",
    hostname: snapshot.description ?? snapshot.user,
    ip: snapshot.ip,
    location: config.networkId,
    mac: snapshot.mac,
    observedAt: normalizeObservedAt(snapshot.lastSeen, observedAt),
    providerId: config.id,
    providerType: "meraki",
    raw: snapshot,
    rxBytes: megabytesToBytes(snapshot.usage?.recv),
    ssid: snapshot.ssid,
    txBytes: megabytesToBytes(snapshot.usage?.sent)
  };
}

export async function listMerakiClientSnapshots(
  client: MerakiClient,
  query: MerakiClientQuery = {}
): Promise<MerakiClientSnapshot[]> {
  if (!client.config.networkId) {
    throw new Error("MERAKI_NETWORK_ID is required");
  }

  const perPage = String(query.perPage ?? 100);
  const timespan = String(query.timespanSeconds ?? 300);
  const url = new URL(`/api/v1/networks/${client.config.networkId}/clients`, client.config.baseUrl ?? "https://api.meraki.com");
  url.searchParams.set("perPage", perPage);
  url.searchParams.set("timespan", timespan);

  return fetchMerakiPages<MerakiClientSnapshot>(client, url);
}

export async function listMerakiObservations(
  client: MerakiClient,
  query: MerakiClientQuery = {}
): Promise<NetworkObservation[]> {
  const snapshots = await listMerakiClientSnapshots(client, query);
  return snapshots
    .map((snapshot) => normalizeMerakiClientSnapshot(client.config, snapshot))
    .filter((observation): observation is NetworkObservation => Boolean(observation));
}

export function getMerakiClientFromEnv(env: NodeJS.ProcessEnv = process.env): MerakiClient {
  const apiKey = env.MERAKI_API_KEY;
  const networkId = env.MERAKI_NETWORK_ID;
  if (!apiKey) throw new Error("MERAKI_API_KEY is required");
  if (!networkId) throw new Error("MERAKI_NETWORK_ID is required");

  return {
    apiKey,
    config: {
      baseUrl: env.MERAKI_API_BASE_URL,
      displayName: "Cisco Meraki",
      id: env.MERAKI_PROVIDER_ID ?? "meraki",
      networkId,
      organizationId: env.MERAKI_ORGANIZATION_ID,
      type: "meraki"
    }
  };
}

async function fetchMerakiPages<T>(client: MerakiClient, firstUrl: URL): Promise<T[]> {
  const rows: T[] = [];
  let nextUrl: string | undefined = firstUrl.toString();

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Accept: "application/json",
        "X-Cisco-Meraki-API-Key": client.apiKey
      },
      next: {
        revalidate: 0
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Meraki API ${response.status}: ${redactApiError(body)}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("Meraki API returned an unexpected client payload");
    }

    rows.push(...payload as T[]);
    nextUrl = parseNextLink(response.headers.get("link"));
  }

  return rows;
}

function parseNextLink(linkHeader: string | null) {
  if (!linkHeader) return undefined;
  const links = linkHeader.split(",");
  const next = links.find((link) => link.includes('rel="next"'));
  const match = next?.match(/<([^>]+)>/);
  return match?.[1];
}

function redactApiError(value: string) {
  return value.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]");
}

function normalizeObservedAt(value: MerakiClientSnapshot["lastSeen"], fallback: string) {
  if (!value) return fallback;
  return new Date(value * 1000).toISOString();
}

function megabytesToBytes(value?: number) {
  if (!value) return 0;
  return Math.round(value * 1_000_000);
}
