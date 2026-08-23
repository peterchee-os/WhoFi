export type NetworkProviderType = "demo" | "omada";

export type NetworkProviderConfig = {
  id: string;
  type: NetworkProviderType;
  displayName: string;
};

export type NetworkObservation = {
  providerId: string;
  providerType: NetworkProviderType;
  observedAt: string;
  eventType: "client_seen" | "client_disconnected" | "usage_sample";
  mac: string;
  hostname?: string;
  ip?: string;
  ssid?: string;
  apName?: string;
  location?: string;
  rxBytes: number;
  txBytes: number;
  burstScore?: number;
  privateMacSuspected?: boolean;
  raw?: unknown;
};

export type NetworkProvider = {
  readonly config: NetworkProviderConfig;
  listObservations(): Promise<NetworkObservation[]>;
};

