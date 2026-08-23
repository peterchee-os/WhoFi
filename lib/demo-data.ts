import type { Alert, Device, Profile } from "./types";

const now = Date.now();
const minutesAgo = (minutes: number) => new Date(now - minutes * 60000).toISOString();
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60000).toISOString();

export const demoProfiles: Profile[] = [
  {
    id: "prof-lina",
    displayName: "Lina Park",
    profileType: "guest",
    profileLevel: "verified",
    organizationName: "Northstar Labs",
    email: "lina@example.test",
    lastSeen: minutesAgo(4)
  },
  {
    id: "prof-river",
    displayName: "River Chen",
    profileType: "drop_in",
    profileLevel: "claimed",
    organizationName: "Independent",
    lastSeen: minutesAgo(18)
  },
  {
    id: "prof-foundry",
    displayName: "Foundry Analytics",
    profileType: "customer",
    profileLevel: "linked",
    organizationName: "Foundry Analytics",
    lastSeen: minutesAgo(2)
  },
  {
    id: "prof-frontdesk",
    displayName: "Front Desk iPad",
    profileType: "staff",
    profileLevel: "operational",
    organizationName: "Operator",
    lastSeen: minutesAgo(1)
  },
  {
    id: "prof-agent-ava",
    displayName: "Build Runner",
    profileType: "agent",
    profileLevel: "operational",
    organizationName: "Operator",
    lastSeen: minutesAgo(3)
  }
];

export const demoDevices: Device[] = [
  {
    id: "dev-lina-laptop",
    mac: "02:11:22:33:44:10",
    hostname: "lina-mbp",
    ip: "192.0.2.41",
    ssid: "Guest WiFi",
    apName: "Commons AP-03",
    location: "Main Location",
    status: "claimed",
    riskState: "normal",
    profileId: "prof-lina",
    firstSeen: hoursAgo(4),
    lastSeen: minutesAgo(4),
    rxBytes: 1_950_000_000,
    txBytes: 420_000_000,
    burstScore: 18
  },
  {
    id: "dev-agent-runner",
    mac: "02:11:22:33:44:20",
    hostname: "build-runner-01",
    ip: "192.0.2.52",
    ssid: "Ops WiFi",
    apName: "Lab AP-01",
    location: "Main Location",
    status: "agent_host",
    riskState: "known_agent",
    profileId: "prof-agent-ava",
    firstSeen: hoursAgo(9),
    lastSeen: minutesAgo(3),
    rxBytes: 8_400_000_000,
    txBytes: 2_700_000_000,
    burstScore: 62
  },
  {
    id: "dev-unknown-burst",
    mac: "02:11:22:33:44:30",
    hostname: "ubuntu",
    ip: "192.0.2.67",
    ssid: "Guest WiFi",
    apName: "Commons AP-04",
    location: "Main Location",
    status: "unknown",
    riskState: "automation_like",
    firstSeen: hoursAgo(1),
    lastSeen: minutesAgo(1),
    rxBytes: 19_200_000_000,
    txBytes: 11_600_000_000,
    burstScore: 91,
    privateMacSuspected: true
  },
  {
    id: "dev-river-phone",
    mac: "02:11:22:33:44:40",
    hostname: "river-iphone",
    ip: "192.0.2.72",
    ssid: "Guest WiFi",
    apName: "Cafe AP-02",
    location: "Main Location",
    status: "claimed",
    riskState: "normal",
    profileId: "prof-river",
    firstSeen: hoursAgo(2),
    lastSeen: minutesAgo(18),
    rxBytes: 540_000_000,
    txBytes: 88_000_000,
    burstScore: 7,
    privateMacSuspected: true
  },
  {
    id: "dev-foundry-build",
    mac: "02:11:22:33:44:50",
    hostname: "foundry-buildbox",
    ip: "192.0.2.88",
    ssid: "Member WiFi",
    apName: "Suite AP-02",
    location: "Main Location",
    status: "staff_assigned",
    riskState: "watch",
    profileId: "prof-foundry",
    firstSeen: hoursAgo(7),
    lastSeen: minutesAgo(2),
    rxBytes: 6_900_000_000,
    txBytes: 1_400_000_000,
    burstScore: 45
  },
  {
    id: "dev-frontdesk-ipad",
    mac: "02:11:22:33:44:60",
    hostname: "frontdesk-ipad",
    ip: "192.0.2.12",
    ssid: "Staff WiFi",
    apName: "Lobby AP-01",
    location: "Main Location",
    status: "managed",
    riskState: "normal",
    profileId: "prof-frontdesk",
    firstSeen: hoursAgo(24),
    lastSeen: minutesAgo(1),
    rxBytes: 180_000_000,
    txBytes: 42_000_000,
    burstScore: 2
  }
];

export const demoAlerts: Alert[] = [
  {
    id: "alert-unknown-burst",
    deviceId: "dev-unknown-burst",
    title: "Unknown device has automation-like burst traffic",
    severity: "warning",
    status: "open",
    label: "automation_like",
    details: "High upload/download burst on guest SSID. Label as automation-like until reviewed.",
    openedAt: minutesAgo(12)
  },
  {
    id: "alert-agent-ok",
    deviceId: "dev-agent-runner",
    title: "Known agent host using heavy bandwidth",
    severity: "info",
    status: "acknowledged",
    label: "known_agent",
    details: "Registered host heartbeat is current. Usage is high but expected for build tasks.",
    openedAt: minutesAgo(22)
  },
  {
    id: "alert-foundry-watch",
    deviceId: "dev-foundry-build",
    title: "Customer build host above normal baseline",
    severity: "watch",
    status: "open",
    label: "watch",
    details: "Traffic is elevated but linked to a customer-owned host.",
    openedAt: minutesAgo(38)
  }
];
