export type ProfileType =
  | "guest"
  | "event_attendee"
  | "drop_in"
  | "customer"
  | "staff"
  | "vendor"
  | "agent"
  | "machine"
  | "unknown";

export type ProfileLevel = "seen" | "claimed" | "verified" | "linked" | "operational";

export type DeviceStatus =
  | "unknown"
  | "claimed"
  | "staff_assigned"
  | "managed"
  | "agent_host"
  | "revoked"
  | "ignored";

export type RiskState = "normal" | "watch" | "automation_like" | "possible_bot" | "known_agent" | "needs_review";

export type AlertSeverity = "info" | "watch" | "warning" | "critical";

export type Profile = {
  id: string;
  displayName: string;
  profileType: ProfileType;
  profileLevel: ProfileLevel;
  organizationName?: string;
  eventName?: string;
  teamName?: string;
  email?: string;
  lastSeen: string;
};

export type Device = {
  id: string;
  mac: string;
  hostname: string;
  ip: string;
  ssid: string;
  apName: string;
  location: string;
  status: DeviceStatus;
  riskState: RiskState;
  profileId?: string;
  firstSeen: string;
  lastSeen: string;
  rxBytes: number;
  txBytes: number;
  burstScore: number;
  privateMacSuspected?: boolean;
};

export type Alert = {
  id: string;
  deviceId: string;
  title: string;
  severity: AlertSeverity;
  status: "open" | "acknowledged" | "resolved";
  label: RiskState;
  details: string;
  openedAt: string;
};

export type EventContext = {
  id: string;
  name: string;
  type: "hackathon" | "meetup" | "workshop" | "demo_day";
  location: string;
  startsAt: string;
  endsAt: string;
  attendeeCount: number;
  teamCount: number;
};
