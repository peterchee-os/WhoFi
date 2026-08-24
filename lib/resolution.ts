import type { Device, Profile } from "./types";

export type ResolutionConfidence = "none" | "low" | "medium" | "high";

export type ResolutionEvidenceType =
  | "explicit_assignment"
  | "suggested_profile"
  | "known_agent_profile"
  | "staff_managed_device"
  | "hostname_hint"
  | "private_mac"
  | "unknown_device"
  | "automation_like_behavior";

export type ResolutionEvidence = {
  type: ResolutionEvidenceType;
  label: string;
  weight: number;
};

export type DeviceResolution = {
  deviceId: string;
  profileId?: string;
  displayName: string;
  confidence: ResolutionConfidence;
  confidenceScore: number;
  evidence: ResolutionEvidence[];
  needsReview: boolean;
};

export function resolveDevices(devices: Device[], profiles: Profile[]): DeviceResolution[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  return devices.map((device) => resolveDevice(device, profileById));
}

export function resolveDevice(device: Device, profileById: Map<string, Profile>): DeviceResolution {
  const profile = device.profileId ? profileById.get(device.profileId) : undefined;
  const suggestedProfile = profile ? undefined : findSuggestedProfile(device, Array.from(profileById.values()));
  const resolvedProfile = profile ?? suggestedProfile;
  const evidence: ResolutionEvidence[] = [];

  if (profile) {
    evidence.push({
      label: `Assigned to ${profile.displayName}`,
      type: "explicit_assignment",
      weight: profile.profileLevel === "operational" ? 70 : 55
    });
  }

  if (profile?.profileType === "agent" && profile.profileLevel === "operational") {
    evidence.push({
      label: "Registered operational agent profile",
      type: "known_agent_profile",
      weight: 20
    });
  }

  if (suggestedProfile) {
    evidence.push({
      label: `Suggested owner: ${suggestedProfile.displayName}`,
      type: "suggested_profile",
      weight: 38
    });
  }

  if (device.status === "managed" || device.status === "staff_assigned") {
    evidence.push({
      label: "Staff-managed device state",
      type: "staff_managed_device",
      weight: 12
    });
  }

  if (resolvedProfile && hostnameMatchesProfile(device.hostname, resolvedProfile)) {
    evidence.push({
      label: "Hostname matches owner context",
      type: "hostname_hint",
      weight: profile ? 8 : 12
    });
  }

  if (device.privateMacSuspected) {
    evidence.push({
      label: "Private MAC suspected",
      type: "private_mac",
      weight: -10
    });
  }

  if (!profile) {
    evidence.push({
      label: "No owner profile assigned",
      type: "unknown_device",
      weight: 0
    });
  }

  if (device.riskState === "automation_like" || device.riskState === "possible_bot") {
    evidence.push({
      label: "Behavior needs review",
      type: "automation_like_behavior",
      weight: 0
    });
  }

  const confidenceScore = clamp(evidence.reduce((sum, item) => sum + item.weight, 0), 0, 100);

  return {
    confidence: scoreToConfidence(confidenceScore),
    confidenceScore,
    deviceId: device.id,
    displayName: resolvedProfile?.displayName ?? "Unassigned",
    evidence,
    needsReview: !profile || confidenceScore < 60 || device.riskState === "automation_like" || device.riskState === "possible_bot",
    profileId: resolvedProfile?.id
  };
}

function findSuggestedProfile(device: Device, profiles: Profile[]) {
  return profiles
    .filter((profile) => hostnameMatchesProfile(device.hostname, profile))
    .sort((a, b) => profileSuggestionScore(b) - profileSuggestionScore(a))[0];
}

function profileSuggestionScore(profile: Profile) {
  const levelScore = profile.profileLevel === "operational" ? 4 : profile.profileLevel === "linked" ? 3 : profile.profileLevel === "verified" ? 2 : 1;
  const typeScore = profile.profileType === "staff" || profile.profileType === "customer" ? 2 : profile.profileType === "unknown" ? 0 : 1;
  return levelScore + typeScore;
}

function hostnameMatchesProfile(hostname: string, profile: Profile) {
  const normalizedHostname = normalize(hostname);
  return [
    profile.displayName,
    profile.organizationName,
    profile.teamName
  ]
    .filter(Boolean)
    .map((value) => normalize(value as string))
    .some((value) => value.length >= 4 && normalizedHostname.includes(value.split("-")[0]));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scoreToConfidence(score: number): ResolutionConfidence {
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  if (score > 0) return "low";
  return "none";
}
