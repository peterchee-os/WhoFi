import type { DeviceSnapshot, DeviceSource } from "./device-ledger";
import type { Device } from "./types";

export type UsageRollupDimension = "ap" | "location" | "ssid";

export type UsageRollup = {
  dimension: UsageRollupDimension;
  id: string;
  label: string;
  onlineDevices: number;
  reviewSignals: number;
  topDeviceHostname?: string;
  totalBytes: number;
  totalRxBytes: number;
  totalTxBytes: number;
  unknownDevices: number;
};

export type SessionSnapshot = {
  observedAt: string;
  rollups: UsageRollup[];
  source: DeviceSource;
  totals: {
    onlineDevices: number;
    reviewSignals: number;
    totalBytes: number;
    totalRxBytes: number;
    totalTxBytes: number;
    unknownDevices: number;
  };
};

export function buildSessionSnapshot(deviceSnapshot: DeviceSnapshot): SessionSnapshot {
  const devices = deviceSnapshot.devices;
  const totals = summarizeDevices(devices);

  return {
    observedAt: deviceSnapshot.observedAt,
    rollups: [
      ...rollupDevices(devices, "location"),
      ...rollupDevices(devices, "ssid"),
      ...rollupDevices(devices, "ap")
    ],
    source: deviceSnapshot.source,
    totals
  };
}

function rollupDevices(devices: Device[], dimension: UsageRollupDimension): UsageRollup[] {
  const groups = new Map<string, Device[]>();

  for (const device of devices) {
    const label = getDimensionLabel(device, dimension);
    const key = `${dimension}:${label.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), device]);
  }

  return Array.from(groups.entries())
    .map(([id, groupDevices]) => {
      const summary = summarizeDevices(groupDevices);
      const topDevice = [...groupDevices].sort((a, b) => totalBytes(b) - totalBytes(a))[0];

      return {
        ...summary,
        dimension,
        id,
        label: getDimensionLabel(topDevice, dimension),
        topDeviceHostname: topDevice?.hostname
      };
    })
    .sort((a, b) => b.totalBytes - a.totalBytes);
}

function summarizeDevices(devices: Device[]): SessionSnapshot["totals"] {
  return devices.reduce(
    (summary, device) => {
      const deviceBytes = totalBytes(device);
      summary.onlineDevices += device.status === "ignored" ? 0 : 1;
      summary.reviewSignals += device.riskState === "normal" ? 0 : 1;
      summary.totalBytes += deviceBytes;
      summary.totalRxBytes += device.rxBytes;
      summary.totalTxBytes += device.txBytes;
      summary.unknownDevices += device.status === "unknown" ? 1 : 0;
      return summary;
    },
    {
      onlineDevices: 0,
      reviewSignals: 0,
      totalBytes: 0,
      totalRxBytes: 0,
      totalTxBytes: 0,
      unknownDevices: 0
    }
  );
}

function getDimensionLabel(device: Device | undefined, dimension: UsageRollupDimension) {
  if (!device) return "Unknown";
  if (dimension === "ap") return device.apName || "Unknown AP";
  if (dimension === "ssid") return device.ssid || "Unknown SSID";
  return device.location || "Unknown location";
}

function totalBytes(device: Device) {
  return device.rxBytes + device.txBytes;
}
