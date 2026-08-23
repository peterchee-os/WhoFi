import type { NetworkObservation, NetworkProviderConfig } from "./types";

export type OmadaClientSnapshot = {
  mac?: string;
  name?: string;
  hostName?: string;
  ip?: string;
  ssid?: string;
  apName?: string;
  siteName?: string;
  downloadByte?: number;
  uploadByte?: number;
  rxBytes?: number;
  txBytes?: number;
  lastSeen?: string | number;
};

export type OmadaProviderConfig = NetworkProviderConfig & {
  type: "omada";
  baseUrl?: string;
  controllerId?: string;
  siteId?: string;
};

export function normalizeOmadaClientSnapshot(
  config: OmadaProviderConfig,
  snapshot: OmadaClientSnapshot,
  observedAt = new Date().toISOString()
): NetworkObservation | null {
  if (!snapshot.mac) return null;

  return {
    apName: snapshot.apName,
    eventType: "client_seen",
    hostname: snapshot.hostName ?? snapshot.name,
    ip: snapshot.ip,
    location: snapshot.siteName,
    mac: snapshot.mac,
    observedAt: normalizeObservedAt(snapshot.lastSeen, observedAt),
    providerId: config.id,
    providerType: "omada",
    raw: snapshot,
    rxBytes: snapshot.downloadByte ?? snapshot.rxBytes ?? 0,
    ssid: snapshot.ssid,
    txBytes: snapshot.uploadByte ?? snapshot.txBytes ?? 0
  };
}

function normalizeObservedAt(value: OmadaClientSnapshot["lastSeen"], fallback: string) {
  if (!value) return fallback;
  if (typeof value === "string") return value;

  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  return new Date(milliseconds).toISOString();
}

