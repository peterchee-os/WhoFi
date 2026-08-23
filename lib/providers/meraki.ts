import type { NetworkObservation, NetworkProviderConfig } from "./types";

export type MerakiProviderConfig = NetworkProviderConfig & {
  type: "meraki";
  organizationId?: string;
  networkId?: string;
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

function normalizeObservedAt(value: MerakiClientSnapshot["lastSeen"], fallback: string) {
  if (!value) return fallback;
  return new Date(value * 1000).toISOString();
}

function megabytesToBytes(value?: number) {
  if (!value) return 0;
  return Math.round(value * 1_000_000);
}
