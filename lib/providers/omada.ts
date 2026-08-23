import type { NetworkObservation, NetworkProviderConfig } from "./types";

export type OmadaClientSnapshot = {
  ap?: string;
  apMac?: string;
  mac?: string;
  clientMac?: string;
  clientName?: string;
  name?: string;
  hostName?: string;
  ip?: string;
  ipAddress?: string;
  network?: string;
  ssid?: string;
  apName?: string;
  siteName?: string;
  downloadByte?: number;
  downloadTraffic?: number;
  trafficDown?: number;
  uploadByte?: number;
  trafficUp?: number;
  rxBytes?: number;
  txBytes?: number;
  lastSeen?: string | number;
  uptime?: string | number;
  status?: string;
};

export type OmadaProviderConfig = NetworkProviderConfig & {
  type: "omada";
  apiBaseUrl?: string;
  controllerId?: string;
  serviceTier?: "essentials" | "standard";
  siteId?: string;
  siteName?: string;
};

export type OmadaClient = {
  config: OmadaProviderConfig;
  password: string;
  username: string;
};

export type OmadaClientQuery = {
  currentPage?: number;
  currentPageSize?: number;
};

export function normalizeOmadaClientSnapshot(
  config: OmadaProviderConfig,
  snapshot: OmadaClientSnapshot,
  observedAt = new Date().toISOString()
): NetworkObservation | null {
  const mac = snapshot.mac ?? snapshot.clientMac;
  if (!mac) return null;

  return {
    apName: snapshot.apName ?? snapshot.ap ?? snapshot.apMac,
    eventType: snapshot.status === "DISCONNECTED" ? "client_disconnected" : "client_seen",
    hostname: snapshot.hostName ?? snapshot.name ?? snapshot.clientName,
    ip: snapshot.ip ?? snapshot.ipAddress,
    location: snapshot.siteName ?? config.siteName ?? config.siteId,
    mac,
    observedAt: normalizeObservedAt(snapshot.lastSeen, observedAt),
    providerId: config.id,
    providerType: "omada",
    raw: snapshot,
    rxBytes: snapshot.downloadByte ?? snapshot.downloadTraffic ?? snapshot.trafficDown ?? snapshot.rxBytes ?? 0,
    ssid: snapshot.ssid,
    txBytes: snapshot.uploadByte ?? snapshot.trafficUp ?? snapshot.txBytes ?? 0
  };
}

export async function listOmadaClientSnapshots(
  client: OmadaClient,
  query: OmadaClientQuery = {}
): Promise<OmadaClientSnapshot[]> {
  const token = await loginOmada(client);
  const currentPage = String(query.currentPage ?? 1);
  const currentPageSize = String(query.currentPageSize ?? 100);
  const url = new URL(
    `/openapi/v2/${client.config.controllerId}/sites/${client.config.siteId}/clients`,
    client.config.apiBaseUrl
  );

  const payload = await fetchOmadaJson<OmadaClientListPayload>(client, url, token, {
    body: {
      page: Number(currentPage),
      pageSize: Number(currentPageSize)
    },
    method: "POST"
  });
  return readOmadaRows(payload);
}

export async function listOmadaObservations(
  client: OmadaClient,
  query: OmadaClientQuery = {}
): Promise<NetworkObservation[]> {
  const snapshots = await listOmadaClientSnapshots(client, query);
  return snapshots
    .map((snapshot) => normalizeOmadaClientSnapshot(client.config, snapshot))
    .filter((observation): observation is NetworkObservation => Boolean(observation));
}

export function getOmadaClientFromEnv(env: NodeJS.ProcessEnv = process.env): OmadaClient {
  const apiBaseUrl = env.OMADA_API_BASE_URL;
  const controllerId = env.OMADA_CONTROLLER_ID;
  const siteId = env.OMADA_SITE_ID;
  const username = env.OMADA_USERNAME;
  const password = env.OMADA_PASSWORD;

  if (!env.OMADA_SERVICE_TIER) throw new Error("OMADA_SERVICE_TIER is required");
  if (!apiBaseUrl) throw new Error("OMADA_API_BASE_URL is required");
  if (!controllerId) throw new Error("OMADA_CONTROLLER_ID is required");
  if (!siteId) throw new Error("OMADA_SITE_ID is required");
  if (!username) throw new Error("OMADA_USERNAME is required");
  if (!password) throw new Error("OMADA_PASSWORD is required");

  return {
    config: {
      apiBaseUrl,
      controllerId,
      displayName: "Omada",
      id: env.OMADA_PROVIDER_ID ?? "omada",
      serviceTier: env.OMADA_SERVICE_TIER === "standard" ? "standard" : "essentials",
      siteId,
      siteName: env.OMADA_SITE_NAME,
      type: "omada"
    },
    password,
    username
  };
}

type OmadaLoginPayload = {
  errorCode?: number;
  msg?: string;
  result?: {
    token?: string;
  };
};

type OmadaClientListPayload = {
  data?: OmadaClientSnapshot[] | { data?: OmadaClientSnapshot[] };
  errorCode?: number;
  msg?: string;
  result?: OmadaClientSnapshot[] | { data?: OmadaClientSnapshot[] };
};

async function loginOmada(client: OmadaClient) {
  const url = new URL(`/${client.config.controllerId}/api/v2/login`, client.config.apiBaseUrl);
  const response = await fetch(url, {
    body: JSON.stringify({
      password: client.password,
      username: client.username
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    method: "POST",
    next: {
      revalidate: 0
    }
  });

  const payload = await readJson<OmadaLoginPayload>(response);
  if (!response.ok || payload.errorCode !== 0 || !payload.result?.token) {
    throw new Error(`Omada login failed: ${redactOmadaError(payload.msg ?? response.statusText)}`);
  }

  return payload.result.token;
}

async function fetchOmadaJson<T>(
  client: OmadaClient,
  url: URL,
  token: string,
  options: { body?: unknown; method?: "GET" | "POST" } = {}
): Promise<T> {
  const response = await fetch(url, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Csrf-Token": token
    },
    method: options.method ?? "GET",
    next: {
      revalidate: 0
    }
  });

  const payload = await readJson<T & { errorCode?: number; msg?: string }>(response);
  if (!response.ok || (typeof payload.errorCode === "number" && payload.errorCode !== 0)) {
    const hint = response.status === 401 || response.status === 404
      ? " (login succeeded, OpenAPI client endpoint authorization still needs confirmation)"
      : "";
    throw new Error(`Omada API ${response.status}: ${redactOmadaError(payload.msg ?? response.statusText)}${hint}`);
  }

  return payload;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Omada API returned non-JSON response: ${redactOmadaError(text.slice(0, 120))}`);
  }
}

function readOmadaRows(payload: OmadaClientListPayload): OmadaClientSnapshot[] {
  const candidates = [
    payload.result,
    payload.data,
    typeof payload.result === "object" && !Array.isArray(payload.result) ? payload.result.data : undefined,
    typeof payload.data === "object" && !Array.isArray(payload.data) ? payload.data.data : undefined
  ];
  const rows = candidates.find(Array.isArray);
  if (!rows) throw new Error("Omada API returned an unexpected client payload");
  return rows;
}

function redactOmadaError(value: string) {
  return value
    .replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/([A-Fa-f0-9]{2}[:-]){5}[A-Fa-f0-9]{2}/g, "[mac]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]");
}

function normalizeObservedAt(value: OmadaClientSnapshot["lastSeen"], fallback: string) {
  if (!value) return fallback;
  if (typeof value === "string") return value;

  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  return new Date(milliseconds).toISOString();
}
