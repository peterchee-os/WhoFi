import { demoDevices } from "@/lib/demo-data";
import type { NetworkObservation, NetworkProvider } from "./types";

export const demoNetworkProvider: NetworkProvider = {
  config: {
    displayName: "Demo Network",
    id: "demo-network",
    type: "demo"
  },
  async listObservations() {
    return demoDevices.map(deviceToObservation);
  }
};

function deviceToObservation(device: typeof demoDevices[number]): NetworkObservation {
  return {
    apName: device.apName,
    burstScore: device.burstScore,
    eventType: "client_seen",
    hostname: device.hostname,
    ip: device.ip,
    location: device.location,
    mac: device.mac,
    observedAt: device.lastSeen,
    privateMacSuspected: device.privateMacSuspected,
    providerId: demoNetworkProvider.config.id,
    providerType: demoNetworkProvider.config.type,
    raw: {
      demoDeviceId: device.id
    },
    rxBytes: device.rxBytes,
    ssid: device.ssid,
    txBytes: device.txBytes
  };
}

