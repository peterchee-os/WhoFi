"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  Check,
  Download,
  Eye,
  Gauge,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  RefreshCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  Wifi,
  type LucideIcon
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { demoAlerts, demoDevices, demoProfiles } from "@/lib/demo-data";
import { formatBytes, formatRelativeTime, percent } from "@/lib/format";
import { integrationCatalog, type IntegrationCatalogItem } from "@/lib/integrations/catalog";
import { resolveDevices, type DeviceResolution } from "@/lib/resolution";
import { buildSessionSnapshot, type SessionSnapshot, type UsageRollup, type UsageRollupDimension } from "@/lib/session-rollups";
import { buildSnapshotTrends, type SnapshotTrendReport } from "@/lib/snapshot-trends";
import {
  buildSnapshotReviewQueue,
  buildSnapshotReviewQueueSummary,
  createSnapshotHistoryEntry,
  defaultSnapshotReviewPolicy,
  type SnapshotCaptureComparison,
  type SnapshotCaptureRecord,
  type SnapshotHistoryEntry,
  type SnapshotReviewPolicy,
  type SnapshotReviewQueueItem,
  type SnapshotReviewQueueSummary
} from "@/lib/snapshot-history";
import type { Alert, AlertStatus, Device, DeviceStatus, Profile, ProfileSource, RiskState } from "@/lib/types";

type View = "dashboard" | "devices" | "usage" | "profiles" | "alerts" | "settings";
type DeviceSnapshotSource = "demo" | "omada" | "omada-pp";
type ProfileSuggestionSourceFilter = "all" | ProfileSource;
type SnapshotHistorySourceFilter = "all" | DeviceSnapshotSource;
type SnapshotReviewQueueSeverityFilter = "all" | SnapshotReviewQueueItem["severity"];
type SnapshotStorageLimits = {
  captureLimit: number;
  historyLimit: number;
};
type SnapshotArchiveImportSummary = {
  duplicateCaptures: number;
  duplicateEntries: number;
  importableCaptures: number;
  importableEntries: number;
  invalidCaptures: number;
  invalidEntries: number;
  retainedCapturesAfterImport: number;
  retainedEntriesAfterImport: number;
  sourceCounts: Record<string, number>;
};
type PendingSnapshotArchiveImport = {
  archive: unknown;
  fileName: string;
  summary: SnapshotArchiveImportSummary;
};
type NotificationProviderMode = "disabled" | "console" | "resend";
type EmailDeliveryStatus = "sent" | "failed" | "disabled" | "rendered";
type NotificationRuleKey =
  | "daily_digest"
  | "unknown_high_bandwidth"
  | "automation_like_burst"
  | "revoked_owner_online"
  | "known_agent_missing_heartbeat"
  | "collector_offline";

type DeviceSnapshotVerification = {
  configured: boolean;
  kind: "access_point" | "client";
  label?: string;
  present: boolean;
};

type NotificationSettings = {
  providerMode: NotificationProviderMode;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  digestRecipients: string;
  criticalRecipients: string;
  batchSettlingMinutes: number;
  rules: Record<NotificationRuleKey, NotificationRule>;
};

type NotificationRule = {
  enabled: boolean;
  delivery: "digest" | "immediate";
  recipientGroup: "digest" | "critical";
  severity: "info" | "watch" | "warning" | "critical";
};

type EmailDelivery = {
  id: string;
  notificationType: string;
  recipient: string;
  provider: NotificationProviderMode;
  status: EmailDeliveryStatus;
  providerMessageId?: string;
  error?: string;
  createdAt: string;
};

type IntegrationTestState = {
  status: "idle" | "testing" | "success" | "error";
  message: string;
  testedAt?: string;
};

type CsvPreviewState = {
  status: "idle" | "previewing" | "success" | "error";
  message: string;
  profiles?: Profile[];
  summary?: {
    companies: number;
    entitlements: number;
    people: number;
  };
};
type CsvIdentitySnapshotPayload = {
  companies: Array<{
    displayName: string;
    externalId: string;
  }>;
  people: Array<{
    companyExternalId?: string;
    displayName: string;
    email?: string;
    externalId: string;
    profileHint?: Profile["profileType"];
    status?: "active" | "inactive" | "unknown";
  }>;
};

type NetworkProviderConfigStatus = {
  configured: boolean;
  detail?: string;
  displayName: string;
  liveSourceTokenRequired?: boolean;
  liveSnapshotsEnabled?: boolean;
  missing: string[];
  providerId: string;
  required: string[];
};

type LiveSourceAccess = {
  enabled: boolean;
  loaded: boolean;
  tokenRequired: boolean;
};

type AdminAuthState = {
  authenticated: boolean;
  configured: boolean;
  enabled: boolean;
  loaded: boolean;
};

type ReviewState = {
  activity: ActivityEntry[];
  alertStatusOverrides: Record<string, AlertStatus>;
  emailDeliveries: EmailDelivery[];
  ignoredProfileSuggestionIds?: string[];
  importedProfiles?: Profile[];
  notificationSettings: NotificationSettings;
  profileOverrides: Record<string, string | undefined>;
  riskOverrides: Record<string, RiskState>;
  snapshotHistory?: SnapshotHistoryEntry[];
  statusOverrides: Record<string, DeviceStatus>;
};

type ActivityEntry = {
  id: string;
  message: string;
  timestamp: string;
};

type ProfileSuggestionQueueItem = {
  confidence: DeviceResolution["confidence"];
  confidenceScore: number;
  device: Device;
  id: string;
  profile: Profile;
  profileSource: ProfileSource;
  reason: string;
  usage: number;
};

const navItems: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "devices", label: "Devices", icon: Wifi },
  { id: "usage", label: "Usage", icon: Activity },
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "alerts", label: "Alerts", icon: AlertTriangle },
  { id: "settings", label: "Settings", icon: Settings }
];

const deviceSourceOptions: Array<{ id: DeviceSnapshotSource; label: string }> = [
  { id: "demo", label: "Demo" },
  { id: "omada", label: "Omada" },
  { id: "omada-pp", label: "Omada CLI" }
];

const reviewStateKey = "whofi.demo.reviewState";

const viewTitles: Record<View, { title: string; subtitle: string }> = {
  dashboard: {
    title: "WiFi Identity Ledger",
    subtitle: "Devices, owners, bandwidth, and review signals."
  },
  devices: {
    title: "Devices",
    subtitle: "Current clients and ownership state."
  },
  usage: {
    title: "Usage",
    subtitle: "Session rollups by location, SSID, and AP."
  },
  profiles: {
    title: "Profiles",
    subtitle: "Claimed, linked, and operational owners."
  },
  alerts: {
    title: "Alerts",
    subtitle: "Open review queue."
  },
  settings: {
    title: "Settings",
    subtitle: "Operator configuration."
  }
};

const notificationRuleLabels: Record<NotificationRuleKey, string> = {
  daily_digest: "Daily digest",
  unknown_high_bandwidth: "Unknown high bandwidth",
  automation_like_burst: "Automation-like burst",
  revoked_owner_online: "Revoked owner online",
  known_agent_missing_heartbeat: "Agent heartbeat missing",
  collector_offline: "Collector offline"
};

const defaultNotificationSettings: NotificationSettings = {
  providerMode: "console",
  fromName: "WhoFi",
  fromEmail: "alerts@example.test",
  replyToEmail: "ops@example.test",
  digestRecipients: "ops@example.test",
  criticalRecipients: "oncall@example.test",
  batchSettlingMinutes: 30,
  rules: {
    daily_digest: {
      enabled: true,
      delivery: "digest",
      recipientGroup: "digest",
      severity: "info"
    },
    unknown_high_bandwidth: {
      enabled: true,
      delivery: "immediate",
      recipientGroup: "critical",
      severity: "warning"
    },
    automation_like_burst: {
      enabled: true,
      delivery: "immediate",
      recipientGroup: "critical",
      severity: "warning"
    },
    revoked_owner_online: {
      enabled: true,
      delivery: "immediate",
      recipientGroup: "critical",
      severity: "critical"
    },
    known_agent_missing_heartbeat: {
      enabled: true,
      delivery: "digest",
      recipientGroup: "critical",
      severity: "watch"
    },
    collector_offline: {
      enabled: true,
      delivery: "digest",
      recipientGroup: "critical",
      severity: "watch"
    }
  }
};

const seededEmailDeliveries: EmailDelivery[] = [
  {
    id: "email-demo-digest",
    notificationType: "daily_digest",
    recipient: "ops@example.test",
    provider: "console",
    status: "rendered",
    createdAt: new Date(Date.now() - 44 * 60000).toISOString()
  },
  {
    id: "email-demo-burst",
    notificationType: "automation_like_burst",
    recipient: "oncall@example.test",
    provider: "console",
    status: "rendered",
    createdAt: new Date(Date.now() - 12 * 60000).toISOString()
  }
];

export default function Home() {
  const snapshotArchiveImportRef = useRef<HTMLInputElement>(null);
  const snapshotReviewPolicyImportRef = useRef<HTMLInputElement>(null);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [query, setQuery] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("dev-unknown-burst");
  const [deviceSnapshotSource, setDeviceSnapshotSource] = useState<DeviceSnapshotSource>("demo");
  const [liveSourceToken, setLiveSourceToken] = useState("");
  const [snapshotObservedAt, setSnapshotObservedAt] = useState(new Date().toISOString());
  const [selectedSnapshotComparison, setSelectedSnapshotComparison] = useState<SnapshotCaptureComparison>();
  const [selectedSnapshotCapture, setSelectedSnapshotCapture] = useState<SnapshotCaptureRecord>();
  const [selectedSnapshotCaptureId, setSelectedSnapshotCaptureId] = useState("");
  const [snapshotReviewNoteDraft, setSnapshotReviewNoteDraft] = useState("");
  const [persistedSnapshotCaptureIds, setPersistedSnapshotCaptureIds] = useState<string[]>([]);
  const [snapshotReviewPolicy, setSnapshotReviewPolicy] = useState<SnapshotReviewPolicy>(defaultSnapshotReviewPolicy);
  const [snapshotReviewPolicyState, setSnapshotReviewPolicyState] = useState<IntegrationTestState>({
    message: "Default policy",
    status: "idle"
  });
  const [reviewQueueUpdating, setReviewQueueUpdating] = useState(false);
  const [snapshotCaptureState, setSnapshotCaptureState] = useState<IntegrationTestState>({
    message: "No capture selected",
    status: "idle"
  });
  const [pendingSnapshotArchiveImport, setPendingSnapshotArchiveImport] = useState<PendingSnapshotArchiveImport>();
  const [adminAuth, setAdminAuth] = useState<AdminAuthState>({
    authenticated: false,
    configured: false,
    enabled: false,
    loaded: false
  });
  const [liveSourceAccess, setLiveSourceAccess] = useState<LiveSourceAccess>({
    enabled: false,
    loaded: false,
    tokenRequired: false
  });
  const [sourceDevices, setSourceDevices] = useState<Device[]>(demoDevices);
  const [sourceState, setSourceState] = useState<IntegrationTestState>({
    message: "Demo",
    status: "success"
  });
  const [notificationSettings, setNotificationSettings] = useState(defaultNotificationSettings);
  const [emailDeliveries, setEmailDeliveries] = useState(seededEmailDeliveries);
  const [ignoredProfileSuggestionIds, setIgnoredProfileSuggestionIds] = useState<string[]>([]);
  const [importedProfiles, setImportedProfiles] = useState<Profile[]>([]);
  const [profileOverrides, setProfileOverrides] = useState<Record<string, string | undefined>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, DeviceStatus>>({});
  const [riskOverrides, setRiskOverrides] = useState<Record<string, RiskState>>({});
  const [alertStatusOverrides, setAlertStatusOverrides] = useState<Record<string, AlertStatus>>({});
  const [snapshotHistory, setSnapshotHistory] = useState<SnapshotHistoryEntry[]>([]);
  const [snapshotStorageLimits, setSnapshotStorageLimits] = useState<SnapshotStorageLimits>({
    captureLimit: 25,
    historyLimit: 100
  });
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [notice, setNotice] = useState("Ready");

  useEffect(() => {
    const stored = window.localStorage.getItem(reviewStateKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<ReviewState>;
        setActivity(parsed.activity ?? []);
        setAlertStatusOverrides(parsed.alertStatusOverrides ?? {});
        setEmailDeliveries(parsed.emailDeliveries ?? seededEmailDeliveries);
        setIgnoredProfileSuggestionIds(parsed.ignoredProfileSuggestionIds ?? []);
        setImportedProfiles(parsed.importedProfiles ?? []);
        setNotificationSettings(mergeNotificationSettings(parsed.notificationSettings));
        setProfileOverrides(parsed.profileOverrides ?? {});
        setRiskOverrides(parsed.riskOverrides ?? {});
        setSnapshotHistory(parsed.snapshotHistory ?? []);
        setStatusOverrides(parsed.statusOverrides ?? {});
      } catch {
        window.localStorage.removeItem(reviewStateKey);
      }
    } else {
      const observedAt = new Date().toISOString();
      setActivity([
        {
          id: "initial",
          message: "Demo snapshot loaded",
          timestamp: observedAt
        }
      ]);
      setSnapshotHistory([createSnapshotHistoryEntry("demo", demoDevices, observedAt)]);
    }
    setStateLoaded(true);
  }, []);

  useEffect(() => {
    if (!stateLoaded) return;

    const nextState: ReviewState = {
      activity,
      alertStatusOverrides,
      emailDeliveries,
      ignoredProfileSuggestionIds,
      importedProfiles,
      notificationSettings,
      profileOverrides,
      riskOverrides,
      snapshotHistory,
      statusOverrides
    };
    window.localStorage.setItem(reviewStateKey, JSON.stringify(nextState));
  }, [
    activity,
    alertStatusOverrides,
    emailDeliveries,
    ignoredProfileSuggestionIds,
    importedProfiles,
    notificationSettings,
    profileOverrides,
    riskOverrides,
    snapshotHistory,
    stateLoaded,
    statusOverrides
  ]);

  useEffect(() => {
    if (!notice || notice === "Ready") return;

    const timeout = window.setTimeout(() => setNotice("Ready"), 2200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/admin/status")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        setAdminAuth({
          authenticated: Boolean(payload.authenticated),
          configured: Boolean(payload.configured),
          enabled: Boolean(payload.enabled),
          loaded: true
        });
      })
      .catch(() => {
        if (cancelled) return;
        setAdminAuth({
          authenticated: false,
          configured: false,
          enabled: true,
          loaded: true
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!adminAuth.loaded) {
      return () => {
        cancelled = true;
      };
    }

    if (adminAuth.enabled && !adminAuth.authenticated) {
      setLiveSourceAccess({
        enabled: false,
        loaded: true,
        tokenRequired: false
      });
      return () => {
        cancelled = true;
      };
    }

    fetch("/api/providers/network/status")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        const providers = Array.isArray(payload.providers) ? payload.providers as NetworkProviderConfigStatus[] : [];
        const liveProviders = providers.filter((provider) => provider.providerId === "omada" || provider.providerId === "omada-printing-press");
        setLiveSourceAccess({
          enabled: liveProviders.some((provider) => provider.liveSnapshotsEnabled),
          loaded: true,
          tokenRequired: liveProviders.some((provider) => provider.liveSourceTokenRequired)
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLiveSourceAccess({
          enabled: false,
          loaded: true,
          tokenRequired: false
        });
      });

    return () => {
      cancelled = true;
    };
  }, [adminAuth.authenticated, adminAuth.enabled, adminAuth.loaded]);

  useEffect(() => {
    let cancelled = false;

    if (!adminAuth.loaded || (adminAuth.enabled && !adminAuth.authenticated)) {
      return () => {
        cancelled = true;
      };
    }

    fetch("/api/snapshot-history")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || !Array.isArray(payload.entries)) return;
        if (isSnapshotStorageLimits(payload.limits)) {
          setSnapshotStorageLimits(payload.limits);
        }
        setPersistedSnapshotCaptureIds(payload.entries.map((entry: SnapshotHistoryEntry) => entry.id));
        setSnapshotHistory((current) => payload.entries.length
          ? mergeSnapshotHistory(payload.entries).slice(0, 10)
          : current);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [adminAuth.authenticated, adminAuth.enabled, adminAuth.loaded]);

  useEffect(() => {
    let cancelled = false;

    if (!adminAuth.loaded || (adminAuth.enabled && !adminAuth.authenticated)) {
      return () => {
        cancelled = true;
      };
    }

    fetch("/api/snapshot-history/review-policy")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || !payload.policy) return;
        setSnapshotReviewPolicy(payload.policy as SnapshotReviewPolicy);
        setSnapshotReviewPolicyState({
          message: "Policy loaded",
          status: "success",
          testedAt: new Date().toISOString()
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshotReviewPolicyState({
          message: "Using default policy",
          status: "idle"
        });
      });

    return () => {
      cancelled = true;
    };
  }, [adminAuth.authenticated, adminAuth.enabled, adminAuth.loaded]);

  const devices = useMemo(() => {
    return sourceDevices.map((device) => ({
      ...device,
      profileId: profileOverrides[device.id] ?? device.profileId,
      status: statusOverrides[device.id] ?? device.status,
      riskState: riskOverrides[device.id] ?? device.riskState
    }));
  }, [profileOverrides, riskOverrides, sourceDevices, statusOverrides]);
  const profiles = useMemo(() => mergeProfiles(demoProfiles, importedProfiles), [importedProfiles]);
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const ownerMix = useMemo(() => getOwnerMix(profiles), [profiles]);

  const alerts = useMemo(() => {
    return demoAlerts.map((alert) => ({
      ...alert,
      status: alertStatusOverrides[alert.id] ?? alert.status
    }));
  }, [alertStatusOverrides]);

  const metrics = useMemo(() => getMetrics(devices, alerts), [alerts, devices]);
  const sessionSnapshot = useMemo(
    () => buildSessionSnapshot({
      count: devices.length,
      devices,
      observedAt: snapshotObservedAt,
      source: deviceSnapshotSource
    }),
    [deviceSnapshotSource, devices, snapshotObservedAt]
  );
  const maxUsage = useMemo(() => Math.max(0, ...devices.map((device) => device.rxBytes + device.txBytes)), [devices]);
  const resolutions = useMemo(() => resolveDevices(devices, profiles), [devices, profiles]);
  const resolutionByDeviceId = useMemo(
    () => new Map(resolutions.map((resolution) => [resolution.deviceId, resolution])),
    [resolutions]
  );
  const allProfileSuggestionQueue = useMemo(
    () => buildProfileSuggestionQueue(devices, resolutionByDeviceId, profileById),
    [devices, profileById, resolutionByDeviceId]
  );
  const profileSuggestionQueue = useMemo(
    () => allProfileSuggestionQueue.filter((item) => !ignoredProfileSuggestionIds.includes(item.id)),
    [allProfileSuggestionQueue, ignoredProfileSuggestionIds]
  );
  const ignoredProfileSuggestionCount = allProfileSuggestionQueue.length - profileSuggestionQueue.length;

  const filteredDevices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return devices;

    return devices.filter((device) => {
      const profile = device.profileId ? profileById.get(device.profileId) : undefined;
      return [
        device.hostname,
        device.mac,
        device.ip,
        device.ssid,
        device.apName,
        device.status,
        device.riskState,
        profile?.displayName,
        profile?.organizationName
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [devices, profileById, query]);

  const title = viewTitles[activeView];
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? devices[0];

  const recordSnapshotHistory = (source: DeviceSnapshotSource, snapshotDevices: Device[], observedAt: string) => {
    const entry = createSnapshotHistoryEntry(source, snapshotDevices, observedAt);
    setSnapshotHistory((current) => [entry, ...current].slice(0, 10));
  };

  const clearSnapshotHistory = async () => {
    try {
      const response = await fetch("/api/snapshot-history", { method: "DELETE" });
      if (!response.ok) throw new Error("History clear failed");
      const payload = (await response.json().catch(() => undefined)) as { limits?: unknown } | undefined;
      if (isSnapshotStorageLimits(payload?.limits)) {
        setSnapshotStorageLimits(payload.limits);
      }
      setPersistedSnapshotCaptureIds([]);
      setSnapshotHistory([]);
      setSelectedSnapshotComparison(undefined);
      setSelectedSnapshotCapture(undefined);
      setSelectedSnapshotCaptureId("");
      setSnapshotReviewNoteDraft("");
      setSnapshotCaptureState({
        message: "No capture selected",
        status: "idle"
      });
      setNotice("History cleared");
      addActivity(setActivity, "Cleared snapshot history");
    } catch {
      setNotice("History clear failed");
    }
  };

  const pruneSnapshotHistory = async () => {
    setSnapshotCaptureState({
      message: "Pruning history",
      status: "testing"
    });

    try {
      const response = await fetch("/api/snapshot-history", {
        body: JSON.stringify({ action: "prune" }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });
      const payload = (await response.json()) as {
        captures?: SnapshotCaptureRecord[];
        entries?: SnapshotHistoryEntry[];
        error?: string;
        limits?: unknown;
        prunedCaptures?: number;
        prunedEntries?: number;
      };
      if (!response.ok || !Array.isArray(payload.entries)) {
        throw new Error(payload.error ?? "History prune failed");
      }

      if (isSnapshotStorageLimits(payload.limits)) {
        setSnapshotStorageLimits(payload.limits);
      }
      setPersistedSnapshotCaptureIds((payload.captures ?? []).map((capture) => capture.id));
      setSnapshotHistory(mergeSnapshotHistory(payload.entries).slice(0, 10));
      setSelectedSnapshotComparison(undefined);
      setSelectedSnapshotCapture(undefined);
      setSelectedSnapshotCaptureId("");
      setSnapshotReviewNoteDraft("");
      setSnapshotCaptureState({
        message: `Pruned ${payload.prunedCaptures ?? 0} captures`,
        status: "success",
        testedAt: new Date().toISOString()
      });
      setNotice("Snapshot history pruned");
      addActivity(setActivity, "Pruned snapshot history");
    } catch (error) {
      const message = error instanceof Error ? error.message : "History prune failed";
      setSnapshotCaptureState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("History prune failed");
    }
  };

  const deleteSelectedSnapshotCapture = async () => {
    if (!selectedSnapshotCaptureId) return;

    try {
      const response = await fetch(`/api/snapshot-history/${encodeURIComponent(selectedSnapshotCaptureId)}`, {
        method: "DELETE"
      });
      const payload = (await response.json()) as {
        entries?: SnapshotHistoryEntry[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(payload.entries)) {
        throw new Error(payload.error ?? "Capture delete failed");
      }

      setPersistedSnapshotCaptureIds(payload.entries.map((entry) => entry.id));
      setSnapshotHistory((current) => mergeSnapshotHistory(payload.entries ?? [], current.filter((entry) => entry.id !== selectedSnapshotCaptureId)).slice(0, 10));
      setSelectedSnapshotComparison(undefined);
      setSelectedSnapshotCapture(undefined);
      setSelectedSnapshotCaptureId("");
      setSnapshotReviewNoteDraft("");
      setSnapshotCaptureState({
        message: "No capture selected",
        status: "idle"
      });
      setNotice("Capture deleted");
      addActivity(setActivity, "Deleted stored snapshot capture");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Capture delete failed";
      setSnapshotCaptureState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Capture delete failed");
    }
  };

  const exportSelectedSnapshotCapture = () => {
    if (!selectedSnapshotCapture) return;
    const payload = {
      capture: selectedSnapshotCapture,
      comparison: selectedSnapshotComparison,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `whofi-capture-${selectedSnapshotCapture.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Capture exported");
    addActivity(setActivity, `Exported stored snapshot capture ${selectedSnapshotCapture.id}`);
  };

  const exportSelectedSnapshotReport = async () => {
    if (!selectedSnapshotCaptureId) return;

    try {
      const response = await fetch(`/api/snapshot-history/${encodeURIComponent(selectedSnapshotCaptureId)}/report`);
      if (!response.ok) throw new Error("Capture report export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `whofi-capture-${selectedSnapshotCaptureId}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Capture report exported");
      addActivity(setActivity, `Exported stored snapshot capture report ${selectedSnapshotCaptureId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Capture report export failed";
      setSnapshotCaptureState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Capture report export failed");
    }
  };

  const exportSnapshotReviewQueueReport = async (
    sourceFilter: SnapshotHistorySourceFilter,
    severityFilter: SnapshotReviewQueueSeverityFilter
  ) => {
    try {
      const params = new URLSearchParams({
        severity: severityFilter,
        source: sourceFilter
      });
      const response = await fetch(`/api/snapshot-history/review-queue/report?${params.toString()}`);
      if (!response.ok) throw new Error("Review queue report export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `whofi-review-queue-${sourceFilter}-${severityFilter}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Queue report exported");
      addActivity(setActivity, "Exported snapshot review queue report");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review queue report export failed";
      setSnapshotCaptureState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Queue report export failed");
    }
  };

  const exportSnapshotTrendReport = async (sourceFilter: SnapshotHistorySourceFilter) => {
    try {
      const params = new URLSearchParams({
        source: sourceFilter
      });
      const response = await fetch(`/api/snapshot-history/trends/report?${params.toString()}`);
      if (!response.ok) throw new Error("Snapshot trend report export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `whofi-snapshot-trends-${sourceFilter}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Trend report exported");
      addActivity(setActivity, "Exported snapshot trend report");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Snapshot trend report export failed";
      setSnapshotCaptureState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Trend report export failed");
    }
  };

  const exportSnapshotArchive = async (sourceFilter: SnapshotHistorySourceFilter) => {
    try {
      const params = new URLSearchParams({
        source: sourceFilter
      });
      const response = await fetch(`/api/snapshot-history/export?${params.toString()}`);
      if (!response.ok) throw new Error("Snapshot archive export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `whofi-snapshot-archive-${sourceFilter}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Snapshot archive exported");
      addActivity(setActivity, "Exported snapshot archive");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Snapshot archive export failed";
      setSnapshotCaptureState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Snapshot archive export failed");
    }
  };

  const importSnapshotArchive = async (file?: File | null) => {
    if (!file) return;

    setSnapshotCaptureState({
      message: "Validating archive",
      status: "testing"
    });

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/snapshot-history/import?dryRun=true", {
        body: JSON.stringify(parsed),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = (await response.json()) as {
        error?: string;
        limits?: unknown;
        summary?: unknown;
      };
      if (!response.ok || !isSnapshotArchiveImportSummary(payload.summary)) {
        throw new Error(payload.error ?? "Snapshot archive import failed");
      }

      if (isSnapshotStorageLimits(payload.limits)) {
        setSnapshotStorageLimits(payload.limits);
      }
      setPendingSnapshotArchiveImport({
        archive: parsed,
        fileName: file.name,
        summary: payload.summary
      });
      setSnapshotCaptureState({
        message: `Previewed ${payload.summary.importableCaptures} captures`,
        status: "success",
        testedAt: new Date().toISOString()
      });
      setNotice("Snapshot archive ready to import");
      addActivity(setActivity, "Previewed snapshot archive");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Snapshot archive import failed";
      setSnapshotCaptureState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Snapshot archive import failed");
    } finally {
      if (snapshotArchiveImportRef.current) {
        snapshotArchiveImportRef.current.value = "";
      }
    }
  };

  const confirmSnapshotArchiveImport = async () => {
    if (!pendingSnapshotArchiveImport) return;

    setSnapshotCaptureState({
      message: "Importing archive",
      status: "testing"
    });

    try {
      const response = await fetch("/api/snapshot-history/import", {
        body: JSON.stringify(pendingSnapshotArchiveImport.archive),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = (await response.json()) as {
        captures?: SnapshotCaptureRecord[];
        entries?: SnapshotHistoryEntry[];
        error?: string;
        importedCaptures?: number;
        importedEntries?: number;
        limits?: unknown;
        summary?: unknown;
      };
      if (!response.ok || !Array.isArray(payload.entries)) {
        throw new Error(payload.error ?? "Snapshot archive import failed");
      }

      if (isSnapshotStorageLimits(payload.limits)) {
        setSnapshotStorageLimits(payload.limits);
      }
      setPersistedSnapshotCaptureIds((payload.captures ?? []).map((capture) => capture.id));
      setSnapshotHistory(mergeSnapshotHistory(payload.entries).slice(0, 10));
      setSelectedSnapshotComparison(undefined);
      setSelectedSnapshotCapture(undefined);
      setSelectedSnapshotCaptureId("");
      setSnapshotReviewNoteDraft("");
      setPendingSnapshotArchiveImport(undefined);
      setSnapshotCaptureState({
        message: `Imported ${payload.importedCaptures ?? 0} captures`,
        status: "success",
        testedAt: new Date().toISOString()
      });
      setNotice("Snapshot archive imported");
      addActivity(setActivity, "Imported snapshot archive");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Snapshot archive import failed";
      setSnapshotCaptureState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Snapshot archive import failed");
    }
  };

  const updateSnapshotReviewPolicy = async (policy: SnapshotReviewPolicy) => {
    setSnapshotReviewPolicy(policy);
    setSnapshotReviewPolicyState({
      message: "Saving policy",
      status: "testing"
    });

    try {
      const response = await fetch("/api/snapshot-history/review-policy", {
        body: JSON.stringify(policy),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });
      const payload = (await response.json()) as {
        error?: string;
        policy?: SnapshotReviewPolicy;
      };
      if (!response.ok || !payload.policy) {
        throw new Error(payload.error ?? "Review policy save failed");
      }

      setSnapshotReviewPolicy(payload.policy);
      setSnapshotReviewPolicyState({
        message: "Policy saved",
        status: "success",
        testedAt: new Date().toISOString()
      });
      setNotice("Review policy saved");
      addActivity(setActivity, "Updated snapshot review policy");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review policy save failed";
      setSnapshotReviewPolicyState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Review policy save failed");
    }
  };

  const exportSnapshotReviewPolicy = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      policy: snapshotReviewPolicy,
      schema: "whofi.snapshot-review-policy.v1"
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "whofi-snapshot-review-policy.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Review policy exported");
    addActivity(setActivity, "Exported snapshot review policy");
  };

  const importSnapshotReviewPolicy = async (file?: File | null) => {
    if (!file) return;

    setSnapshotReviewPolicyState({
      message: "Importing policy",
      status: "testing"
    });

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const policy = getImportedSnapshotReviewPolicy(parsed);
      if (!policy) {
        throw new Error("Invalid review policy import");
      }

      await updateSnapshotReviewPolicy(policy);
      setNotice("Review policy imported");
      addActivity(setActivity, "Imported snapshot review policy");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review policy import failed";
      setSnapshotReviewPolicyState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Review policy import failed");
    } finally {
      if (snapshotReviewPolicyImportRef.current) {
        snapshotReviewPolicyImportRef.current.value = "";
      }
    }
  };

  const resetSnapshotReviewPolicy = async () => {
    setSnapshotReviewPolicyState({
      message: "Resetting policy",
      status: "testing"
    });

    try {
      const response = await fetch("/api/snapshot-history/review-policy", {
        method: "DELETE"
      });
      const payload = (await response.json()) as {
        error?: string;
        policy?: SnapshotReviewPolicy;
      };
      if (!response.ok || !payload.policy) {
        throw new Error(payload.error ?? "Review policy reset failed");
      }

      setSnapshotReviewPolicy(payload.policy);
      setSnapshotReviewPolicyState({
        message: "Policy reset",
        status: "success",
        testedAt: new Date().toISOString()
      });
      setNotice("Review policy reset");
      addActivity(setActivity, "Reset snapshot review policy");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review policy reset failed";
      setSnapshotReviewPolicyState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Review policy reset failed");
    }
  };

  const useSelectedSnapshotCapture = () => {
    if (!selectedSnapshotCapture) return;
    const snapshot = selectedSnapshotCapture.deviceSnapshot;

    setDeviceSnapshotSource(snapshot.source);
    setSourceDevices(snapshot.devices);
    setSelectedDeviceId(snapshot.devices[0]?.id ?? "");
    setSnapshotObservedAt(snapshot.observedAt);
    setSourceState({
      message: `Loaded stored ${formatDeviceSourceLabel(snapshot.source)} capture`,
      status: "success",
      testedAt: new Date().toISOString()
    });
    setNotice("Stored capture loaded");
    addActivity(setActivity, `Loaded stored snapshot capture ${selectedSnapshotCapture.id}`);
  };

  const updateSelectedSnapshotReview = async (reviewed?: boolean) => {
    if (!selectedSnapshotCaptureId) return;

    try {
      const response = await fetch(`/api/snapshot-history/${encodeURIComponent(selectedSnapshotCaptureId)}`, {
        body: JSON.stringify({
          reviewNote: snapshotReviewNoteDraft,
          reviewed
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });
      const payload = (await response.json()) as {
        capture?: SnapshotCaptureRecord;
        comparison?: SnapshotCaptureComparison;
        entries?: SnapshotHistoryEntry[];
        error?: string;
      };
      if (!response.ok || !payload.capture || !Array.isArray(payload.entries)) {
        throw new Error(payload.error ?? "Capture review update failed");
      }

      setSelectedSnapshotCapture(payload.capture);
      setSelectedSnapshotComparison(payload.comparison);
      setPersistedSnapshotCaptureIds(payload.entries.map((entry) => entry.id));
      setSnapshotHistory((current) => mergeSnapshotHistory(payload.entries ?? [], current).slice(0, 10));
      setSnapshotReviewNoteDraft(payload.capture.summary.reviewNote ?? "");
      setSnapshotCaptureState({
        message: payload.capture.summary.reviewedAt ? "Capture reviewed" : "Capture note saved",
        status: "success",
        testedAt: new Date().toISOString()
      });
      setNotice(payload.capture.summary.reviewedAt ? "Capture reviewed" : "Capture note saved");
      addActivity(setActivity, `${payload.capture.summary.reviewedAt ? "Reviewed" : "Updated"} stored snapshot capture`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Capture review update failed";
      setSnapshotCaptureState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Capture review update failed");
    }
  };

  const loadSnapshotCapture = async (entryId: string, compareToId?: string) => {
    setSelectedSnapshotCaptureId(entryId);
    setSnapshotCaptureState({
      message: "Loading capture",
      status: "testing"
    });

    try {
      const params = compareToId ? `?compareTo=${encodeURIComponent(compareToId)}` : "";
      const response = await fetch(`/api/snapshot-history/${encodeURIComponent(entryId)}${params}`);
      const payload = (await response.json()) as {
        capture?: SnapshotCaptureRecord;
        comparison?: SnapshotCaptureComparison;
        error?: string;
      };
      if (!response.ok || !payload.capture) {
        throw new Error(payload.error ?? "Capture load failed");
      }

      setSelectedSnapshotComparison(payload.comparison);
      setSelectedSnapshotCapture(payload.capture);
      setSnapshotReviewNoteDraft(payload.capture.summary.reviewNote ?? "");
      setSnapshotCaptureState({
        message: compareToId ? "Baseline loaded" : "Capture loaded",
        status: "success",
        testedAt: new Date().toISOString()
      });
      setNotice(compareToId ? "Comparison baseline loaded" : "Capture loaded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Capture load failed";
      setSelectedSnapshotComparison(undefined);
      setSelectedSnapshotCapture(undefined);
      setSnapshotReviewNoteDraft("");
      setSnapshotCaptureState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Capture load failed");
    }
  };

  const markVisibleSnapshotQueueReviewed = async (ids: string[]) => {
    if (ids.length === 0 || reviewQueueUpdating) return;

    setReviewQueueUpdating(true);
    try {
      const response = await fetch("/api/snapshot-history/review-queue", {
        body: JSON.stringify({
          ids,
          reviewed: true
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });
      const payload = (await response.json()) as {
        entries?: SnapshotHistoryEntry[];
        error?: string;
        updatedIds?: string[];
      };
      if (!response.ok || !Array.isArray(payload.entries)) {
        throw new Error(payload.error ?? "Review queue update failed");
      }

      const updatedIds = Array.isArray(payload.updatedIds) ? payload.updatedIds : [];
      setPersistedSnapshotCaptureIds(payload.entries.map((entry) => entry.id));
      setSnapshotHistory((current) => mergeSnapshotHistory(payload.entries ?? [], current).slice(0, 10));
      if (selectedSnapshotCaptureId && updatedIds.includes(selectedSnapshotCaptureId)) {
        void loadSnapshotCapture(selectedSnapshotCaptureId);
      }
      setSnapshotCaptureState({
        message: `${updatedIds.length} capture ${updatedIds.length === 1 ? "review" : "reviews"} closed`,
        status: "success",
        testedAt: new Date().toISOString()
      });
      setNotice("Queue reviewed");
      addActivity(setActivity, `Marked ${updatedIds.length} visible snapshot ${updatedIds.length === 1 ? "review" : "reviews"} reviewed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review queue update failed";
      setSnapshotCaptureState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Queue update failed");
    } finally {
      setReviewQueueUpdating(false);
    }
  };

  const loadDeviceSource = async (source: DeviceSnapshotSource) => {
    setSourceState({
      message: "Loading",
      status: "testing"
    });

    if (source !== "demo" && !liveSourceAccess.enabled) {
      setSourceState({
        message: liveSourceAccess.loaded ? "Live off" : "Checking",
        status: liveSourceAccess.loaded ? "error" : "testing",
        testedAt: new Date().toISOString()
      });
      setNotice(liveSourceAccess.loaded ? "Live disabled" : "Checking access");
      return;
    }

    try {
      const headers = liveSourceToken.trim() ? { "X-WhoFi-Live-Source-Token": liveSourceToken.trim() } : undefined;
      const response = await fetch(`/api/snapshot-history/capture?source=${source}`, {
        headers,
        method: "POST"
      });
      const payload = (await response.json()) as {
        devices?: Device[];
        error?: string;
        limits?: unknown;
        observedAt?: string;
        snapshotHistory?: SnapshotHistoryEntry[];
        source?: DeviceSnapshotSource;
        verificationClient?: DeviceSnapshotVerification;
      };
      if (!response.ok || !Array.isArray(payload.devices)) {
        throw new Error(payload.error ?? "Device source failed");
      }

      setDeviceSnapshotSource(source);
      setSourceDevices(payload.devices);
      setSelectedDeviceId(payload.devices[0]?.id ?? "");
      const observedAt = payload.observedAt ?? new Date().toISOString();
      setSnapshotObservedAt(observedAt);
      if (isSnapshotStorageLimits(payload.limits)) {
        setSnapshotStorageLimits(payload.limits);
      }
      if (payload.snapshotHistory?.length) {
        setPersistedSnapshotCaptureIds(payload.snapshotHistory.map((entry) => entry.id));
        setSnapshotHistory((current) => mergeSnapshotHistory(payload.snapshotHistory ?? [], current).slice(0, 10));
        void loadSnapshotCapture(payload.snapshotHistory[0].id);
      } else {
        recordSnapshotHistory(source, payload.devices, observedAt);
      }
      setSourceState({
        message: formatSourceStateMessage(payload.devices.length, payload.verificationClient),
        status: "success",
        testedAt: observedAt
      });
      setNotice("Snapshot captured");
      addActivity(setActivity, `Captured ${formatDeviceSourceLabel(source)} device snapshot (${payload.devices.length} devices)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Device source failed";
      setSourceState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      setNotice("Snapshot load failed");
      addActivity(setActivity, `${formatDeviceSourceLabel(source)} device snapshot failed: ${message}`);
    }
  };

  const assignDevice = (deviceId: string, profileId: string) => {
    const profile = profileById.get(profileId);
    setProfileOverrides((current) => ({ ...current, [deviceId]: profileId }));
    setStatusOverrides((current) => ({ ...current, [deviceId]: "claimed" }));
    setNotice("Owner assigned");
    addActivity(setActivity, `Assigned ${getDeviceLabel(deviceId, devices)} to ${profile?.displayName ?? "owner"}`);
  };

  const assignSuggestedProfiles = (items: ProfileSuggestionQueueItem[]) => {
    if (items.length === 0) {
      setNotice("No suggestions selected");
      return;
    }

    setProfileOverrides((current) => ({
      ...current,
      ...Object.fromEntries(items.map((item) => [item.device.id, item.profile.id]))
    }));
    setStatusOverrides((current) => ({
      ...current,
      ...Object.fromEntries(items.map((item) => [item.device.id, "claimed" as DeviceStatus]))
    }));
    setNotice("Suggestions assigned");
    addActivity(setActivity, `Assigned ${items.length} suggested ${items.length === 1 ? "owner" : "owners"}`);
  };

  const ignoreProfileSuggestions = (items: ProfileSuggestionQueueItem[]) => {
    if (items.length === 0) {
      setNotice("No suggestions selected");
      return;
    }

    const ids = items.map((item) => item.id);
    setIgnoredProfileSuggestionIds((current) => Array.from(new Set([...current, ...ids])));
    setNotice("Suggestions ignored");
    addActivity(setActivity, `Ignored ${items.length} profile ${items.length === 1 ? "suggestion" : "suggestions"}`);
  };

  const restoreIgnoredProfileSuggestions = () => {
    const count = ignoredProfileSuggestionCount;
    setIgnoredProfileSuggestionIds([]);
    setNotice(count ? "Ignored suggestions restored" : "No ignored suggestions");
    if (count) {
      addActivity(setActivity, `Restored ${count} ignored profile ${count === 1 ? "suggestion" : "suggestions"}`);
    }
  };

  const exportProfileSuggestions = (items: ProfileSuggestionQueueItem[]) => {
    if (items.length === 0) {
      setNotice("No suggestions to export");
      return;
    }

    const csv = toCsv([
      ["device_id", "hostname", "mac", "ssid", "ap", "profile_id", "profile_name", "profile_source", "organization", "confidence", "confidence_score", "usage_bytes", "reason"],
      ...items.map((item) => [
        item.device.id,
        item.device.hostname,
        item.device.mac,
        item.device.ssid,
        item.device.apName,
        item.profile.id,
        item.profile.displayName,
        item.profileSource,
        item.profile.organizationName ?? "",
        item.confidence,
        `${item.confidenceScore}`,
        `${item.usage}`,
        item.reason
      ])
    ]);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `whofi-profile-suggestions-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Suggestions exported");
    addActivity(setActivity, `Exported ${items.length} profile ${items.length === 1 ? "suggestion" : "suggestions"}`);
  };

  const importCsvProfiles = (nextProfiles: Profile[]) => {
    if (nextProfiles.length === 0) {
      setNotice("No profiles imported");
      return;
    }

    setImportedProfiles((current) => mergeProfiles(current, nextProfiles));
    setNotice("Roster imported");
    addActivity(setActivity, `Imported ${nextProfiles.length} CSV roster ${nextProfiles.length === 1 ? "profile" : "profiles"}`);
  };

  const exportImportedProfiles = () => {
    const rows = importedProfiles.map((profile) => ({
      company: profile.organizationName ?? "",
      email: profile.email ?? "",
      id: profile.id,
      name: profile.displayName,
      profile_type: profile.profileType,
      status: profile.profileLevel === "seen" ? "inactive" : "active"
    }));
    const csv = toCsv([
      ["id", "name", "email", "company", "profile_type", "status"],
      ...rows.map((row) => [row.id, row.name, row.email, row.company, row.profile_type, row.status])
    ]);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `whofi-imported-profiles-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Imported roster exported");
    addActivity(setActivity, `Exported ${importedProfiles.length} imported CSV ${importedProfiles.length === 1 ? "profile" : "profiles"}`);
  };

  const clearImportedProfiles = () => {
    const importedProfileIds = new Set(importedProfiles.map((profile) => profile.id));
    setImportedProfiles([]);
    setProfileOverrides((current) =>
      Object.fromEntries(Object.entries(current).filter(([, profileId]) => !profileId || !importedProfileIds.has(profileId)))
    );
    setNotice("Imported roster cleared");
    addActivity(setActivity, `Cleared ${importedProfiles.length} imported CSV ${importedProfiles.length === 1 ? "profile" : "profiles"}`);
  };

  const setDeviceRisk = (deviceId: string, riskState: RiskState) => {
    setRiskOverrides((current) => ({ ...current, [deviceId]: riskState }));
    setNotice(riskState === "normal" ? "Marked reviewed" : "Device updated");
    addActivity(setActivity, `${getDeviceLabel(deviceId, devices)} marked ${riskState}`);
  };

  const blockDevice = (deviceId: string) => {
    setStatusOverrides((current) => ({ ...current, [deviceId]: "revoked" }));
    setRiskOverrides((current) => ({ ...current, [deviceId]: "needs_review" }));
    setNotice("Device blocked");
    addActivity(setActivity, `${getDeviceLabel(deviceId, devices)} blocked`);
  };

  const setAlertStatus = (alertId: string, status: AlertStatus) => {
    const alert = demoAlerts.find((candidate) => candidate.id === alertId);
    setAlertStatusOverrides((current) => ({ ...current, [alertId]: status }));
    setNotice(status === "resolved" ? "Alert resolved" : "Alert acknowledged");
    addActivity(setActivity, `${status === "resolved" ? "Resolved" : "Acknowledged"} alert: ${alert?.title ?? alertId}`);
  };

  const resetDemoState = () => {
    const initialActivity = [
      {
        id: crypto.randomUUID(),
        message: "Demo state reset",
        timestamp: new Date().toISOString()
      }
    ];
    setActivity(initialActivity);
    setAlertStatusOverrides({});
    setEmailDeliveries(seededEmailDeliveries);
    setIgnoredProfileSuggestionIds([]);
    setImportedProfiles([]);
    setNotificationSettings(defaultNotificationSettings);
    setProfileOverrides({});
    setRiskOverrides({});
    setStatusOverrides({});
    setDeviceSnapshotSource("demo");
    setSourceDevices(demoDevices);
    const observedAt = new Date().toISOString();
    setSnapshotObservedAt(observedAt);
    recordSnapshotHistory("demo", demoDevices, observedAt);
    setSourceState({
      message: "Demo",
      status: "success"
    });
    setSelectedDeviceId("dev-unknown-burst");
    window.localStorage.removeItem(reviewStateKey);
    setNotice("Reset complete");
  };

  const logoutAdmin = async () => {
    await fetch("/api/auth/admin/logout", { method: "POST" }).catch(() => undefined);
    setAdminAuth((current) => ({
      ...current,
      authenticated: false,
      loaded: true
    }));
    setLiveSourceAccess({
      enabled: false,
      loaded: true,
      tokenRequired: false
    });
    setLiveSourceToken("");
    setNotice("Signed out");
  };

  const exportSnapshot = () => {
    const payload = {
      activity,
      alerts,
      devices,
      deviceSnapshotSource,
      exportedAt: new Date().toISOString(),
      notificationSettings,
      emailDeliveries,
      importedProfiles,
      snapshotHistory,
      profiles,
      reviewState: {
        activity,
        alertStatusOverrides,
        emailDeliveries,
        importedProfiles,
        notificationSettings,
        profileOverrides,
        riskOverrides,
        snapshotHistory,
        statusOverrides
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `whofi-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Snapshot exported");
  };

  if (!adminAuth.loaded) {
    return <AdminGate status="checking" />;
  }

  if (adminAuth.enabled && !adminAuth.authenticated) {
    return (
      <AdminGate
        configured={adminAuth.configured}
        onLogin={(nextAuth) => {
          setAdminAuth(nextAuth);
          setNotice("Signed in");
        }}
        status="locked"
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">W</div>
          <div>
            <h1>WhoFi</h1>
            <p className="muted">Live demo</p>
          </div>
        </div>

        <nav className="nav" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${activeView === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => setActiveView(item.id)}
                title={item.label}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-section">
          <p>Current snapshot</p>
          <p>{metrics.onlineDevices} devices, {profiles.length} profiles, {metrics.reviewSignals} review signals.</p>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div>
            <h2>{title.title}</h2>
            <p>{title.subtitle}</p>
          </div>
          <div className="toolbar">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label="Search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                value={query}
              />
            </label>
            <span className="notice-pill">{notice}</span>
            <div className="source-switch" aria-label="Device source">
              {deviceSourceOptions.map((source) => (
                <button
                  className={deviceSnapshotSource === source.id ? "active" : ""}
                  disabled={source.id !== "demo" && !liveSourceAccess.enabled}
                  key={source.id}
                  onClick={() => loadDeviceSource(source.id)}
                  title={getDeviceSourceTitle(source.id, liveSourceAccess)}
                >
                  {source.label}
                </button>
              ))}
              <span className={`integration-state ${sourceState.status}`}>{sourceState.message}</span>
            </div>
            <label className="live-token-field" title="Live source token">
              <KeyRound size={16} />
              <input
                aria-label="Live source token"
                autoComplete="off"
                disabled={!liveSourceAccess.enabled}
                onChange={(event) => setLiveSourceToken(event.target.value)}
                placeholder={liveSourceAccess.tokenRequired ? "Live token" : "Token optional"}
                type="password"
                value={liveSourceToken}
              />
            </label>
            <button className="icon-button" onClick={resetDemoState} title="Reset">
              <RefreshCcw size={18} />
            </button>
            <button className="text-button" onClick={exportSnapshot} title="Export">
              <Download size={18} />
              Export
            </button>
            {adminAuth.enabled ? (
              <button className="icon-button" onClick={logoutAdmin} title="Sign out">
                <LogOut size={18} />
              </button>
            ) : null}
          </div>
        </header>

        <Metrics metrics={metrics} />

        {activeView === "dashboard" ? (
          <DashboardView
            devices={filteredDevices}
            maxUsage={maxUsage}
            ignoredProfileSuggestionCount={ignoredProfileSuggestionCount}
            onAssignDevice={assignDevice}
            onBlockDevice={blockDevice}
            onBulkAssignSuggestions={assignSuggestedProfiles}
            onExportSuggestions={exportProfileSuggestions}
            onIgnoreSuggestions={ignoreProfileSuggestions}
            onRestoreIgnoredSuggestions={restoreIgnoredProfileSuggestions}
            onSelectDevice={setSelectedDeviceId}
            onSetDeviceRisk={setDeviceRisk}
            onSetAlertStatus={setAlertStatus}
            ownerMix={ownerMix}
            profileById={profileById}
            profiles={profiles}
            profileSuggestionQueue={profileSuggestionQueue}
            activity={activity}
            alerts={alerts}
            resolutionByDeviceId={resolutionByDeviceId}
            selectedDevice={selectedDevice}
            selectedDeviceId={selectedDeviceId}
          />
        ) : null}
        {activeView === "devices" ? (
          <DevicesView
            devices={filteredDevices}
            maxUsage={maxUsage}
            ignoredProfileSuggestionCount={ignoredProfileSuggestionCount}
            onAssignDevice={assignDevice}
            onBlockDevice={blockDevice}
            onBulkAssignSuggestions={assignSuggestedProfiles}
            onExportSuggestions={exportProfileSuggestions}
            onIgnoreSuggestions={ignoreProfileSuggestions}
            onRestoreIgnoredSuggestions={restoreIgnoredProfileSuggestions}
            onSelectDevice={setSelectedDeviceId}
            onSetDeviceRisk={setDeviceRisk}
            profileById={profileById}
            profiles={profiles}
            profileSuggestionQueue={profileSuggestionQueue}
            resolutionByDeviceId={resolutionByDeviceId}
            selectedDeviceId={selectedDeviceId}
          />
        ) : null}
        {activeView === "usage" ? (
          <UsageView
            onClearSnapshotHistory={clearSnapshotHistory}
            onDeleteSelectedSnapshotCapture={deleteSelectedSnapshotCapture}
            onExportSelectedSnapshotCapture={exportSelectedSnapshotCapture}
            onExportSelectedSnapshotReport={exportSelectedSnapshotReport}
            onExportSnapshotArchive={exportSnapshotArchive}
            onExportSnapshotReviewPolicy={exportSnapshotReviewPolicy}
            onExportSnapshotReviewQueueReport={exportSnapshotReviewQueueReport}
            onExportSnapshotTrendReport={exportSnapshotTrendReport}
            onConfirmSnapshotArchiveImport={confirmSnapshotArchiveImport}
            onImportSnapshotArchive={importSnapshotArchive}
            onImportSnapshotReviewPolicy={importSnapshotReviewPolicy}
            onCancelSnapshotArchiveImport={() => setPendingSnapshotArchiveImport(undefined)}
            onLoadSnapshotCapture={loadSnapshotCapture}
            onMarkVisibleSnapshotQueueReviewed={markVisibleSnapshotQueueReviewed}
            onOpenSnapshotArchiveImport={() => snapshotArchiveImportRef.current?.click()}
            onOpenSnapshotReviewPolicyImport={() => snapshotReviewPolicyImportRef.current?.click()}
            onPruneSnapshotHistory={pruneSnapshotHistory}
            onResetSnapshotReviewPolicy={resetSnapshotReviewPolicy}
            onSnapshotReviewNoteChange={setSnapshotReviewNoteDraft}
            onUpdateSnapshotReview={updateSelectedSnapshotReview}
            onUpdateSnapshotReviewPolicy={updateSnapshotReviewPolicy}
            onUseSelectedSnapshotCapture={useSelectedSnapshotCapture}
            persistedSnapshotCaptureIds={persistedSnapshotCaptureIds}
            pendingSnapshotArchiveImport={pendingSnapshotArchiveImport}
            reviewQueueUpdating={reviewQueueUpdating}
            selectedSnapshotComparison={selectedSnapshotComparison}
            selectedSnapshotCapture={selectedSnapshotCapture}
            selectedSnapshotCaptureId={selectedSnapshotCaptureId}
            sessionSnapshot={sessionSnapshot}
            snapshotArchiveImportRef={snapshotArchiveImportRef}
            snapshotCaptureState={snapshotCaptureState}
            snapshotHistory={snapshotHistory}
            snapshotReviewPolicy={snapshotReviewPolicy}
            snapshotReviewPolicyImportRef={snapshotReviewPolicyImportRef}
            snapshotReviewPolicyState={snapshotReviewPolicyState}
            snapshotReviewNoteDraft={snapshotReviewNoteDraft}
            snapshotStorageLimits={snapshotStorageLimits}
          />
        ) : null}
        {activeView === "profiles" ? (
          <ProfilesView
            importedCount={importedProfiles.length}
            onClearImported={clearImportedProfiles}
            onExportImported={exportImportedProfiles}
            profiles={profiles}
          />
        ) : null}
        {activeView === "alerts" ? <AlertsView alerts={alerts} onSetAlertStatus={setAlertStatus} /> : null}
        {activeView === "settings" ? (
          <SettingsView
            deliveries={emailDeliveries}
            onAddActivity={(message) => addActivity(setActivity, message)}
            onDelivery={(delivery) => setEmailDeliveries((current) => [delivery, ...current].slice(0, 12))}
            onImportProfiles={importCsvProfiles}
            onNotice={setNotice}
            onReset={() => {
              setNotificationSettings(defaultNotificationSettings);
              setEmailDeliveries(seededEmailDeliveries);
              setNotice("Defaults restored");
              addActivity(setActivity, "Notification settings reset");
            }}
            onSettingsChange={setNotificationSettings}
            settings={notificationSettings}
          />
        ) : null}
      </section>
    </main>
  );
}

function getMetrics(devices: Device[], alerts: Alert[]) {
  const totalBytes = devices.reduce((sum, device) => sum + device.rxBytes + device.txBytes, 0);
  const unknownDevices = devices.filter((device) => device.status === "unknown").length;
  const deviceSignals = devices.filter((device) =>
    ["automation_like", "possible_bot", "needs_review", "watch"].includes(device.riskState)
  ).length;
  const openAlertCount = alerts.filter((alert) => alert.status === "open").length;

  return {
    onlineDevices: devices.length,
    reviewSignals: deviceSignals + openAlertCount,
    totalBytes,
    unknownDevices
  };
}

function Metrics({ metrics }: { metrics: ReturnType<typeof getMetrics> }) {
  return (
    <section className="metric-grid" aria-label="Current metrics">
      <div className="metric">
        <span>Online devices</span>
        <strong>{metrics.onlineDevices}</strong>
      </div>
      <div className="metric">
        <span>Unknown devices</span>
        <strong>{metrics.unknownDevices}</strong>
      </div>
      <div className="metric">
        <span>Tracked usage</span>
        <strong>{formatBytes(metrics.totalBytes)}</strong>
      </div>
      <div className="metric">
        <span>Review signals</span>
        <strong>{metrics.reviewSignals}</strong>
      </div>
    </section>
  );
}

function AdminGate({
  configured = true,
  onLogin,
  status
}: {
  configured?: boolean;
  onLogin?: (authState: AdminAuthState) => void;
  status: "checking" | "locked";
}) {
  const [password, setPassword] = useState("");
  const [loginState, setLoginState] = useState<IntegrationTestState>({
    message: status === "checking" ? "Checking access" : "Admin access required",
    status: status === "checking" ? "testing" : "idle"
  });

  useEffect(() => {
    if (status !== "locked") return;
    setLoginState((current) => current.status === "testing"
      ? {
          message: "Admin access required",
          status: "idle"
        }
      : current);
  }, [status]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginState({
      message: "Signing in",
      status: "testing"
    });

    try {
      const response = await fetch("/api/auth/admin/login", {
        body: JSON.stringify({ password }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok || !payload.authenticated) {
        throw new Error(payload.error ?? "Sign in failed");
      }

      onLogin?.({
        authenticated: true,
        configured: Boolean(payload.configured),
        enabled: Boolean(payload.enabled),
        loaded: true
      });
    } catch (error) {
      setLoginState({
        message: error instanceof Error ? error.message : "Sign in failed",
        status: "error"
      });
    }
  };

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={login}>
        <div className="brand auth-brand">
          <div className="brand-mark">W</div>
          <div>
            <h1>WhoFi</h1>
            <p className="muted">Admin access</p>
          </div>
        </div>
        <div className="auth-icon">
          <Lock size={24} />
        </div>
        <div>
          <h2>{status === "checking" ? "Checking Access" : "Sign In"}</h2>
          <p>
            {configured
              ? "Enter the admin password for live network operations."
              : "Admin auth is enabled, but WHOFI_ADMIN_PASSWORD is not configured."}
          </p>
        </div>
        <label className="auth-field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            disabled={!configured || status === "checking"}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
        <button className="text-button auth-button" disabled={!configured || status === "checking" || loginState.status === "testing"}>
          <KeyRound size={18} />
          Sign in
        </button>
        <span className={`integration-state ${loginState.status}`}>{loginState.message}</span>
      </form>
    </main>
  );
}

function DashboardView({
  activity,
  alerts,
  devices,
  ignoredProfileSuggestionCount,
  maxUsage,
  onAssignDevice,
  onBlockDevice,
  onBulkAssignSuggestions,
  onExportSuggestions,
  onIgnoreSuggestions,
  onRestoreIgnoredSuggestions,
  onSelectDevice,
  onSetAlertStatus,
  onSetDeviceRisk,
  ownerMix,
  profileById,
  profiles,
  profileSuggestionQueue,
  resolutionByDeviceId,
  selectedDevice,
  selectedDeviceId
}: {
  activity: ActivityEntry[];
  alerts: Alert[];
  devices: Device[];
  ignoredProfileSuggestionCount: number;
  maxUsage: number;
  onAssignDevice: (deviceId: string, profileId: string) => void;
  onBlockDevice: (deviceId: string) => void;
  onBulkAssignSuggestions: (items: ProfileSuggestionQueueItem[]) => void;
  onExportSuggestions: (items: ProfileSuggestionQueueItem[]) => void;
  onIgnoreSuggestions: (items: ProfileSuggestionQueueItem[]) => void;
  onRestoreIgnoredSuggestions: () => void;
  onSelectDevice: (deviceId: string) => void;
  onSetAlertStatus: (alertId: string, status: AlertStatus) => void;
  onSetDeviceRisk: (deviceId: string, riskState: RiskState) => void;
  ownerMix: Array<{ label: string; value: number }>;
  profileById: Map<string, Profile>;
  profiles: Profile[];
  profileSuggestionQueue: ProfileSuggestionQueueItem[];
  resolutionByDeviceId: Map<string, DeviceResolution>;
  selectedDevice: Device;
  selectedDeviceId: string;
}) {
  return (
    <section className="content-grid">
      <DeviceLedger
        devices={devices}
        compact
        maxUsage={maxUsage}
        onSelectDevice={onSelectDevice}
        resolutionByDeviceId={resolutionByDeviceId}
        selectedDeviceId={selectedDeviceId}
        profileById={profileById}
      />

      <div className="side-stack">
        <DeviceInspector
          device={selectedDevice}
          onAssignDevice={onAssignDevice}
          onBlockDevice={onBlockDevice}
          onSetDeviceRisk={onSetDeviceRisk}
          profileById={profileById}
          profiles={profiles}
          resolution={resolutionByDeviceId.get(selectedDevice.id)}
        />
        <ProfileSuggestionQueue
          ignoredCount={ignoredProfileSuggestionCount}
          items={profileSuggestionQueue}
          limit={4}
          onAssign={(item) => onAssignDevice(item.device.id, item.profile.id)}
          onBulkAssign={onBulkAssignSuggestions}
          onExport={onExportSuggestions}
          onBulkIgnore={onIgnoreSuggestions}
          onRestoreIgnored={onRestoreIgnoredSuggestions}
          onSelectDevice={onSelectDevice}
        />
        <OwnerMix ownerMix={ownerMix} />
        <AlertQueue alerts={alerts} limit={3} onSetAlertStatus={onSetAlertStatus} />
        <ActivityLog activity={activity} />
      </div>
    </section>
  );
}

function DevicesView({
  devices,
  ignoredProfileSuggestionCount,
  maxUsage,
  onAssignDevice,
  onBlockDevice,
  onBulkAssignSuggestions,
  onExportSuggestions,
  onIgnoreSuggestions,
  onRestoreIgnoredSuggestions,
  onSelectDevice,
  onSetDeviceRisk,
  profileById,
  profiles,
  profileSuggestionQueue,
  resolutionByDeviceId,
  selectedDeviceId
}: {
  devices: Device[];
  ignoredProfileSuggestionCount: number;
  maxUsage: number;
  onAssignDevice: (deviceId: string, profileId: string) => void;
  onBlockDevice: (deviceId: string) => void;
  onBulkAssignSuggestions: (items: ProfileSuggestionQueueItem[]) => void;
  onExportSuggestions: (items: ProfileSuggestionQueueItem[]) => void;
  onIgnoreSuggestions: (items: ProfileSuggestionQueueItem[]) => void;
  onRestoreIgnoredSuggestions: () => void;
  onSelectDevice: (deviceId: string) => void;
  onSetDeviceRisk: (deviceId: string, riskState: RiskState) => void;
  profileById: Map<string, Profile>;
  profiles: Profile[];
  profileSuggestionQueue: ProfileSuggestionQueueItem[];
  resolutionByDeviceId: Map<string, DeviceResolution>;
  selectedDeviceId: string;
}) {
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? devices[0];

  return (
    <section className="content-grid detail-layout">
      <DeviceLedger
        devices={devices}
        maxUsage={maxUsage}
        onSelectDevice={onSelectDevice}
        profileById={profileById}
        resolutionByDeviceId={resolutionByDeviceId}
        selectedDeviceId={selectedDeviceId}
      />
      <div className="side-stack">
        {selectedDevice ? (
          <DeviceInspector
            device={selectedDevice}
            onAssignDevice={onAssignDevice}
            onBlockDevice={onBlockDevice}
            onSetDeviceRisk={onSetDeviceRisk}
            profileById={profileById}
            profiles={profiles}
            resolution={resolutionByDeviceId.get(selectedDevice.id)}
          />
        ) : (
          <EmptyPanel />
        )}
        <ProfileSuggestionQueue
          ignoredCount={ignoredProfileSuggestionCount}
          items={profileSuggestionQueue}
          onAssign={(item) => onAssignDevice(item.device.id, item.profile.id)}
          onBulkAssign={onBulkAssignSuggestions}
          onExport={onExportSuggestions}
          onBulkIgnore={onIgnoreSuggestions}
          onRestoreIgnored={onRestoreIgnoredSuggestions}
          onSelectDevice={onSelectDevice}
        />
      </div>
    </section>
  );
}

function UsageView({
  onClearSnapshotHistory,
  onDeleteSelectedSnapshotCapture,
  onExportSelectedSnapshotCapture,
  onExportSelectedSnapshotReport,
  onExportSnapshotArchive,
  onExportSnapshotReviewPolicy,
  onExportSnapshotReviewQueueReport,
  onExportSnapshotTrendReport,
  onCancelSnapshotArchiveImport,
  onConfirmSnapshotArchiveImport,
  onImportSnapshotArchive,
  onImportSnapshotReviewPolicy,
  onLoadSnapshotCapture,
  onMarkVisibleSnapshotQueueReviewed,
  onOpenSnapshotArchiveImport,
  onOpenSnapshotReviewPolicyImport,
  onPruneSnapshotHistory,
  onResetSnapshotReviewPolicy,
  onSnapshotReviewNoteChange,
  onUpdateSnapshotReview,
  onUpdateSnapshotReviewPolicy,
  onUseSelectedSnapshotCapture,
  pendingSnapshotArchiveImport,
  persistedSnapshotCaptureIds,
  reviewQueueUpdating,
  selectedSnapshotComparison,
  selectedSnapshotCapture,
  selectedSnapshotCaptureId,
  sessionSnapshot,
  snapshotArchiveImportRef,
  snapshotCaptureState,
  snapshotHistory,
  snapshotReviewPolicy,
  snapshotReviewPolicyImportRef,
  snapshotReviewPolicyState,
  snapshotReviewNoteDraft,
  snapshotStorageLimits
}: {
  onClearSnapshotHistory: () => void;
  onDeleteSelectedSnapshotCapture: () => void;
  onExportSelectedSnapshotCapture: () => void;
  onExportSelectedSnapshotReport: () => void;
  onExportSnapshotArchive: (sourceFilter: SnapshotHistorySourceFilter) => void;
  onExportSnapshotReviewPolicy: () => void;
  onExportSnapshotReviewQueueReport: (
    sourceFilter: SnapshotHistorySourceFilter,
    severityFilter: SnapshotReviewQueueSeverityFilter
  ) => void;
  onExportSnapshotTrendReport: (sourceFilter: SnapshotHistorySourceFilter) => void;
  onCancelSnapshotArchiveImport: () => void;
  onConfirmSnapshotArchiveImport: () => void;
  onImportSnapshotArchive: (file?: File | null) => void;
  onImportSnapshotReviewPolicy: (file?: File | null) => void;
  onLoadSnapshotCapture: (entryId: string, compareToId?: string) => void;
  onMarkVisibleSnapshotQueueReviewed: (ids: string[]) => void;
  onOpenSnapshotArchiveImport: () => void;
  onOpenSnapshotReviewPolicyImport: () => void;
  onPruneSnapshotHistory: () => void;
  onResetSnapshotReviewPolicy: () => void;
  onSnapshotReviewNoteChange: (value: string) => void;
  onUpdateSnapshotReview: (reviewed?: boolean) => void;
  onUpdateSnapshotReviewPolicy: (policy: SnapshotReviewPolicy) => void;
  onUseSelectedSnapshotCapture: () => void;
  pendingSnapshotArchiveImport?: PendingSnapshotArchiveImport;
  persistedSnapshotCaptureIds: string[];
  reviewQueueUpdating: boolean;
  selectedSnapshotComparison?: SnapshotCaptureComparison;
  selectedSnapshotCapture?: SnapshotCaptureRecord;
  selectedSnapshotCaptureId: string;
  sessionSnapshot: SessionSnapshot;
  snapshotArchiveImportRef: RefObject<HTMLInputElement>;
  snapshotCaptureState: IntegrationTestState;
  snapshotHistory: SnapshotHistoryEntry[];
  snapshotReviewPolicy: SnapshotReviewPolicy;
  snapshotReviewPolicyImportRef: RefObject<HTMLInputElement>;
  snapshotReviewPolicyState: IntegrationTestState;
  snapshotReviewNoteDraft: string;
  snapshotStorageLimits: SnapshotStorageLimits;
}) {
  const [historySourceFilter, setHistorySourceFilter] = useState<SnapshotHistorySourceFilter>("all");
  const [reviewQueueSourceFilter, setReviewQueueSourceFilter] = useState<SnapshotHistorySourceFilter>("all");
  const [reviewQueueSeverityFilter, setReviewQueueSeverityFilter] = useState<SnapshotReviewQueueSeverityFilter>("all");
  const maxRollupBytes = Math.max(0, ...sessionSnapshot.rollups.map((rollup) => rollup.totalBytes));
  const filteredSnapshotHistory = useMemo(
    () =>
      historySourceFilter === "all"
        ? snapshotHistory
        : snapshotHistory.filter((entry) => entry.source === historySourceFilter),
    [historySourceFilter, snapshotHistory]
  );
  const snapshotHistoryCounts = useMemo(() => getSnapshotHistoryCounts(snapshotHistory), [snapshotHistory]);
  const snapshotReviewQueue = useMemo(
    () => buildSnapshotReviewQueue(snapshotHistory, snapshotReviewPolicy),
    [snapshotHistory, snapshotReviewPolicy]
  );
  const filteredSnapshotReviewQueue = useMemo(
    () =>
      snapshotReviewQueue.filter((item) => {
        const sourceMatch = reviewQueueSourceFilter === "all" || item.source === reviewQueueSourceFilter;
        const severityMatch = reviewQueueSeverityFilter === "all" || item.severity === reviewQueueSeverityFilter;
        return sourceMatch && severityMatch;
      }),
    [reviewQueueSeverityFilter, reviewQueueSourceFilter, snapshotReviewQueue]
  );
  const snapshotReviewQueueFilterCounts = useMemo(
    () => getSnapshotReviewQueueFilterCounts(snapshotReviewQueue),
    [snapshotReviewQueue]
  );
  const snapshotReviewQueueSummary = useMemo(
    () => buildSnapshotReviewQueueSummary(snapshotHistory, snapshotReviewQueue),
    [snapshotHistory, snapshotReviewQueue]
  );
  const snapshotTrends = useMemo(
    () => buildSnapshotTrends(snapshotHistory, snapshotReviewPolicy, historySourceFilter),
    [historySourceFilter, snapshotHistory, snapshotReviewPolicy]
  );
  const comparisonBaselineOptions = useMemo(() => {
    if (!selectedSnapshotCapture) return [];
    const persistedEntryIdSet = new Set(persistedSnapshotCaptureIds);
    return snapshotHistory.filter((entry) =>
      entry.id !== selectedSnapshotCapture.id &&
      entry.source === selectedSnapshotCapture.summary.source &&
      persistedEntryIdSet.has(entry.id)
    );
  }, [persistedSnapshotCaptureIds, selectedSnapshotCapture, snapshotHistory]);

  return (
    <section className="content-grid usage-layout">
      <div className="side-stack">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Session Totals</h3>
              <p>{formatDeviceSourceLabel(sessionSnapshot.source)} snapshot · <RelativeTime value={sessionSnapshot.observedAt} /></p>
            </div>
            <Activity size={20} color="var(--teal-dark)" />
          </div>
          <div className="usage-summary">
            <div>
              <span>Total usage</span>
              <strong>{formatBytes(sessionSnapshot.totals.totalBytes)}</strong>
            </div>
            <div>
              <span>Download</span>
              <strong>{formatBytes(sessionSnapshot.totals.totalRxBytes)}</strong>
            </div>
            <div>
              <span>Upload</span>
              <strong>{formatBytes(sessionSnapshot.totals.totalTxBytes)}</strong>
            </div>
            <div>
              <span>Unknown</span>
              <strong>{sessionSnapshot.totals.unknownDevices}</strong>
            </div>
          </div>
        </div>

        <SnapshotReviewQueuePanel
          filterCounts={snapshotReviewQueueFilterCounts}
          items={filteredSnapshotReviewQueue}
          onExportReport={() => onExportSnapshotReviewQueueReport(reviewQueueSourceFilter, reviewQueueSeverityFilter)}
          onMarkVisibleReviewed={() => onMarkVisibleSnapshotQueueReviewed(filteredSnapshotReviewQueue.slice(0, 5).map((item) => item.id))}
          onLoadCapture={onLoadSnapshotCapture}
          onSeverityFilterChange={setReviewQueueSeverityFilter}
          onSourceFilterChange={setReviewQueueSourceFilter}
          severityFilter={reviewQueueSeverityFilter}
          selectedEntryId={selectedSnapshotCaptureId}
          sourceFilter={reviewQueueSourceFilter}
          summary={snapshotReviewQueueSummary}
          updating={reviewQueueUpdating}
        />

        <SnapshotReviewPolicyPanel
          importInputRef={snapshotReviewPolicyImportRef}
          onChange={onUpdateSnapshotReviewPolicy}
          onExport={onExportSnapshotReviewPolicy}
          onImport={onImportSnapshotReviewPolicy}
          onImportClick={onOpenSnapshotReviewPolicyImport}
          onReset={onResetSnapshotReviewPolicy}
          policy={snapshotReviewPolicy}
          state={snapshotReviewPolicyState}
        />

        <SnapshotHistoryPanel
          entries={filteredSnapshotHistory}
          filter={historySourceFilter}
          filterCounts={snapshotHistoryCounts}
          importInputRef={snapshotArchiveImportRef}
          importPreview={pendingSnapshotArchiveImport}
          onCancelImport={onCancelSnapshotArchiveImport}
          onClear={onClearSnapshotHistory}
          onConfirmImport={onConfirmSnapshotArchiveImport}
          onExportArchive={() => onExportSnapshotArchive(historySourceFilter)}
          onFilterChange={setHistorySourceFilter}
          onImportArchive={onImportSnapshotArchive}
          onImportArchiveClick={onOpenSnapshotArchiveImport}
          onLoadCapture={onLoadSnapshotCapture}
          persistedEntryIds={persistedSnapshotCaptureIds}
          onPrune={onPruneSnapshotHistory}
          selectedEntryId={selectedSnapshotCaptureId}
          storageLimits={snapshotStorageLimits}
          totalCount={snapshotHistory.length}
        />
      </div>

      <div className="usage-rollup-grid">
        <SnapshotTrendsPanel
          onExportReport={() => onExportSnapshotTrendReport(historySourceFilter)}
          trends={snapshotTrends}
        />
        <SnapshotCapturePanel
          baselineOptions={comparisonBaselineOptions}
          capture={selectedSnapshotCapture}
          comparison={selectedSnapshotComparison}
          onBaselineChange={(baselineId) => selectedSnapshotCaptureId && onLoadSnapshotCapture(selectedSnapshotCaptureId, baselineId)}
          onDelete={onDeleteSelectedSnapshotCapture}
          onExport={onExportSelectedSnapshotCapture}
          onExportReport={onExportSelectedSnapshotReport}
          onReviewNoteChange={onSnapshotReviewNoteChange}
          onUpdateReview={onUpdateSnapshotReview}
          onUseCapture={onUseSelectedSnapshotCapture}
          reviewNoteDraft={snapshotReviewNoteDraft}
          state={snapshotCaptureState}
        />
        <UsageRollupPanel
          dimension="location"
          maxBytes={maxRollupBytes}
          rollups={sessionSnapshot.rollups}
          title="Locations"
        />
        <UsageRollupPanel
          dimension="ssid"
          maxBytes={maxRollupBytes}
          rollups={sessionSnapshot.rollups}
          title="SSIDs"
        />
        <UsageRollupPanel
          dimension="ap"
          maxBytes={maxRollupBytes}
          rollups={sessionSnapshot.rollups}
          title="Access Points"
        />
      </div>
    </section>
  );
}

function UsageRollupPanel({
  dimension,
  maxBytes,
  rollups,
  title
}: {
  dimension: UsageRollupDimension;
  maxBytes: number;
  rollups: UsageRollup[];
  title: string;
}) {
  const visibleRollups = rollups.filter((rollup) => rollup.dimension === dimension).slice(0, 6);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p>{visibleRollups.length} active rollups.</p>
        </div>
      </div>
      <div className="list">
        {visibleRollups.map((rollup) => (
          <div className="list-item compact-item usage-rollup" key={rollup.id}>
            <div className="list-title">
              <strong className="truncate">{rollup.label}</strong>
              <span className="metric-pill">{formatBytes(rollup.totalBytes)}</span>
            </div>
            <div className="usage-bar" aria-label={`${rollup.label} usage`}>
              <span style={{ width: `${percent(rollup.totalBytes, maxBytes)}` }} />
            </div>
            <p>
              {rollup.onlineDevices} devices · {rollup.unknownDevices} unknown · top: {rollup.topDeviceHostname ?? "none"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SnapshotTrendsPanel({
  onExportReport,
  trends
}: {
  onExportReport: () => void;
  trends: SnapshotTrendReport;
}) {
  const visiblePoints = [...trends.points].reverse().slice(0, 6);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Snapshot Trends</h3>
          <p>{trends.summary.captures} captures · {trends.source === "all" ? "All sources" : formatDeviceSourceLabel(trends.source)}</p>
        </div>
        <button
          className="text-button slim"
          disabled={trends.summary.captures === 0}
          onClick={onExportReport}
          type="button"
        >
          Trend Report
        </button>
      </div>
      <div className="usage-summary trend-summary">
        <div>
          <span>Open reviews</span>
          <strong>{trends.summary.openReviews}</strong>
        </div>
        <div>
          <span>Reviewed</span>
          <strong>{trends.summary.reviewedCaptures}</strong>
        </div>
        <div>
          <span>Usage delta</span>
          <strong>{formatSignedBytes(trends.summary.totalBytesDelta)}</strong>
        </div>
        <div>
          <span>Latest unknown</span>
          <strong>{formatSignedNumber(trends.summary.latestUnknownDelta)}</strong>
        </div>
      </div>
      <div className="trend-list">
        {visiblePoints.length ? (
          visiblePoints.map((point) => (
            <div className="trend-row" key={point.id}>
              <div>
                <strong>{formatDeviceSourceLabel(point.source)}</strong>
                <span><RelativeTime value={point.observedAt} /></span>
              </div>
              <div>
                <span>{point.onlineDevices} devices</span>
                <span>{point.unknownDevices} unknown</span>
                <span>{formatBytes(point.totalBytes)}</span>
              </div>
              <span className={`metric-pill ${point.reviewed ? "up" : point.reviewSignals > 0 ? "warning" : "watch"}`}>
                {point.reviewed ? "done" : `${point.reviewSignals}`}
              </span>
            </div>
          ))
        ) : (
          <div className="list-item compact-item">
            <p>No stored captures yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SnapshotCapturePanel({
  baselineOptions,
  capture,
  comparison,
  onBaselineChange,
  onDelete,
  onExport,
  onExportReport,
  onReviewNoteChange,
  onUpdateReview,
  onUseCapture,
  reviewNoteDraft,
  state
}: {
  baselineOptions: SnapshotHistoryEntry[];
  capture?: SnapshotCaptureRecord;
  comparison?: SnapshotCaptureComparison;
  onBaselineChange: (baselineId: string) => void;
  onDelete: () => void;
  onExport: () => void;
  onExportReport: () => void;
  onReviewNoteChange: (value: string) => void;
  onUpdateReview: (reviewed?: boolean) => void;
  onUseCapture: () => void;
  reviewNoteDraft: string;
  state: IntegrationTestState;
}) {
  const topDevices = capture
    ? [...capture.deviceSnapshot.devices]
        .sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes))
        .slice(0, 4)
    : [];

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Capture Detail</h3>
          <p>
            {capture
              ? `${formatDeviceSourceLabel(capture.summary.source)} · ${capture.summary.onlineDevices} devices · `
              : "Select a capture from history."}
            {capture ? <RelativeTime value={capture.summary.observedAt} /> : null}
          </p>
        </div>
        <div className="panel-actions">
          <button className="text-button slim" disabled={!capture} onClick={onUseCapture} title="Use stored capture" type="button">
            Use Snapshot
          </button>
          <button className="text-button slim" disabled={!capture} onClick={onExport} title="Export selected capture JSON" type="button">
            <Download size={16} />
            Export JSON
          </button>
          <button className="text-button slim" disabled={!capture} onClick={onExportReport} title="Export capture report" type="button">
            Report
          </button>
          <button className="text-button slim" disabled={!capture} onClick={onDelete} type="button">
            Delete
          </button>
          <button
            className="text-button slim"
            disabled={!capture}
            onClick={() => onUpdateReview(!capture?.summary.reviewedAt)}
            type="button"
          >
            {capture?.summary.reviewedAt ? "Unreview" : "Mark Reviewed"}
          </button>
          <span className={`integration-state ${state.status}`}>{state.message}</span>
        </div>
      </div>
      {capture ? (
        <>
          <div className="usage-summary capture-summary">
            <div>
              <span>Total usage</span>
              <strong>{formatBytes(capture.summary.totalBytes)}</strong>
            </div>
            <div>
              <span>Unknown</span>
              <strong>{capture.summary.unknownDevices}</strong>
            </div>
            <div>
              <span>Review signals</span>
              <strong>{capture.summary.reviewSignals}</strong>
            </div>
            <div>
              <span>Rollups</span>
              <strong>{capture.sessionSnapshot.rollups.length}</strong>
            </div>
            <div>
              <span>Review</span>
              <strong>{capture.summary.reviewedAt ? "Done" : "Open"}</strong>
            </div>
          </div>
          <div className="capture-review-box">
            <textarea
              onChange={(event) => onReviewNoteChange(event.target.value)}
              placeholder="Review note"
              value={reviewNoteDraft}
            />
            <button className="text-button slim" onClick={() => onUpdateReview()} type="button">
              Save Note
            </button>
          </div>
          <label className="select-field capture-baseline-field">
            <span>Compare baseline</span>
            <select
              disabled={baselineOptions.length === 0}
              onChange={(event) => event.target.value && onBaselineChange(event.target.value)}
              value={comparison?.previousId ?? ""}
            >
              <option value="">Previous same-source capture</option>
              {baselineOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {formatDeviceSourceLabel(entry.source)} · {formatShortDateTime(entry.observedAt)} · {entry.onlineDevices} devices
                </option>
              ))}
            </select>
          </label>
          <div className="comparison-grid">
            <div>
              <span>Devices</span>
              <strong>{comparison ? formatSignedNumber(comparison.deltas.onlineDevices) : "Base"}</strong>
            </div>
            <div>
              <span>Unknown</span>
              <strong>{comparison ? formatSignedNumber(comparison.deltas.unknownDevices) : "Base"}</strong>
            </div>
            <div>
              <span>Signals</span>
              <strong>{comparison ? formatSignedNumber(comparison.deltas.reviewSignals) : "Base"}</strong>
            </div>
            <div>
              <span>Usage</span>
              <strong>{comparison ? formatHistoryDelta(comparison.deltas.totalBytes) : "Base"}</strong>
            </div>
          </div>
          {comparison ? (
            <p className="comparison-caption">
              Compared with <RelativeTime value={comparison.previousObservedAt} />.
            </p>
          ) : (
            <p className="comparison-caption">No earlier stored capture for this source.</p>
          )}
          {comparison ? <SnapshotReviewSignalList comparison={comparison} /> : null}
          {comparison ? <DeviceChangeSummary comparison={comparison} /> : null}
          <div className="list">
            {topDevices.map((device) => (
              <div className="list-item compact-item" key={device.id}>
                <div className="list-title">
                  <strong className="truncate">{device.hostname}</strong>
                  <span className="metric-pill">{formatBytes(device.rxBytes + device.txBytes)}</span>
                </div>
                <p className="truncate">{device.ssid} · {device.apName} · {device.status}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="list-item">
          <p>Stored captures include the device snapshot and session rollups for later audit.</p>
        </div>
      )}
    </div>
  );
}

function SnapshotReviewQueuePanel({
  filterCounts,
  items,
  onExportReport,
  onMarkVisibleReviewed,
  onLoadCapture,
  onSeverityFilterChange,
  onSourceFilterChange,
  severityFilter,
  selectedEntryId,
  sourceFilter,
  summary,
  updating
}: {
  filterCounts: {
    source: Record<SnapshotHistorySourceFilter, number>;
    severity: Record<SnapshotReviewQueueSeverityFilter, number>;
  };
  items: SnapshotReviewQueueItem[];
  onExportReport: () => void;
  onMarkVisibleReviewed: () => void;
  onLoadCapture: (entryId: string) => void;
  onSeverityFilterChange: (filter: SnapshotReviewQueueSeverityFilter) => void;
  onSourceFilterChange: (filter: SnapshotHistorySourceFilter) => void;
  severityFilter: SnapshotReviewQueueSeverityFilter;
  selectedEntryId: string;
  sourceFilter: SnapshotHistorySourceFilter;
  summary: SnapshotReviewQueueSummary;
  updating: boolean;
}) {
  const visibleItems = items.slice(0, 5);
  const sourceFilters: SnapshotHistorySourceFilter[] = ["all", "demo", "omada", "omada-pp"];
  const severityFilters: SnapshotReviewQueueSeverityFilter[] = ["all", "warning", "watch"];

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Capture Review Queue</h3>
          <p>{items.length} visible of {summary.open} open capture reviews.</p>
        </div>
        <div className="button-row compact-actions">
          <button
            className="text-button slim"
            disabled={items.length === 0}
            onClick={onExportReport}
            type="button"
          >
            Queue Report
          </button>
          <button
            className="text-button slim"
            disabled={visibleItems.length === 0 || updating}
            onClick={onMarkVisibleReviewed}
            type="button"
          >
            {updating ? "Reviewing" : "Mark Visible Reviewed"}
          </button>
        </div>
      </div>
      <div className="review-queue-summary">
        <div>
          <span>Open</span>
          <strong>{summary.open}</strong>
        </div>
        <div>
          <span>Warning</span>
          <strong>{summary.warning}</strong>
        </div>
        <div>
          <span>Watch</span>
          <strong>{summary.watch}</strong>
        </div>
        <div>
          <span>Reviewed</span>
          <strong>{summary.reviewed}</strong>
        </div>
      </div>
      <div className="queue-filter-group" aria-label="Review queue source filter">
        {sourceFilters.map((source) => (
          <button
            className={sourceFilter === source ? "active" : ""}
            key={source}
            onClick={() => onSourceFilterChange(source)}
            type="button"
          >
            <span>{source === "all" ? "All" : formatDeviceSourceLabel(source)}</span>
            <strong>{filterCounts.source[source]}</strong>
          </button>
        ))}
      </div>
      <div className="queue-filter-group compact" aria-label="Review queue severity filter">
        {severityFilters.map((severity) => (
          <button
            className={severityFilter === severity ? "active" : ""}
            key={severity}
            onClick={() => onSeverityFilterChange(severity)}
            type="button"
          >
            <span>{severity === "all" ? "All" : severity}</span>
            <strong>{filterCounts.severity[severity]}</strong>
          </button>
        ))}
      </div>
      <div className="list">
        {visibleItems.length ? (
          visibleItems.map((item) => (
            <button
              className={`list-item compact-item history-button review-queue-item ${selectedEntryId === item.id ? "selected" : ""}`}
              key={item.id}
              onClick={() => onLoadCapture(item.id)}
              type="button"
            >
              <div className="list-title">
                <strong>{formatDeviceSourceLabel(item.source)}</strong>
                <span className={`metric-pill ${item.severity}`}>{item.severity}</span>
              </div>
              <p>{item.reason}</p>
              {item.reviewNote ? <p className="truncate">{item.reviewNote}</p> : null}
              <p><RelativeTime value={item.observedAt} /></p>
            </button>
          ))
        ) : (
          <div className="list-item compact-item">
            <p>No open capture reviews match these filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SnapshotReviewPolicyPanel({
  importInputRef,
  onChange,
  onExport,
  onImport,
  onImportClick,
  onReset,
  policy,
  state
}: {
  importInputRef: RefObject<HTMLInputElement>;
  onChange: (policy: SnapshotReviewPolicy) => void;
  onExport: () => void;
  onImport: (file?: File | null) => void;
  onImportClick: () => void;
  onReset: () => void;
  policy: SnapshotReviewPolicy;
  state: IntegrationTestState;
}) {
  const updatePolicy = (patch: Partial<SnapshotReviewPolicy>) => {
    onChange({
      ...policy,
      ...patch
    });
  };
  const highUsageGb = Math.max(0, Math.round(policy.highUsageBytes / 1024 ** 3));

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Review Policy</h3>
          <p>{state.message}</p>
        </div>
        <span className={`integration-state ${state.status}`}>
          {state.status === "success" ? "Saved" : state.status === "error" ? "Error" : "Ready"}
        </span>
      </div>
      <div className="policy-actions">
        <button className="text-button slim" onClick={onExport} type="button">
          Export Policy
        </button>
        <button className="text-button slim" onClick={onImportClick} type="button">
          Import Policy
        </button>
        <button className="text-button slim" onClick={onReset} type="button">
          Reset
        </button>
        <input
          accept="application/json,.json"
          className="hidden-file-input"
          onChange={(event) => onImport(event.target.files?.[0])}
          ref={importInputRef}
          type="file"
        />
      </div>
      <div className="policy-form">
        <label className="toggle-row">
          <input
            checked={policy.triggerOnUnknownDevices}
            onChange={(event) => updatePolicy({ triggerOnUnknownDevices: event.target.checked })}
            type="checkbox"
          />
          <strong>Unknown devices</strong>
        </label>
        <label className="select-field">
          <span>Unknown threshold</span>
          <input
            min={1}
            onChange={(event) => updatePolicy({ unknownDeviceThreshold: Number(event.target.value) })}
            type="number"
            value={policy.unknownDeviceThreshold}
          />
        </label>

        <label className="toggle-row">
          <input
            checked={policy.triggerOnReviewSignals}
            onChange={(event) => updatePolicy({ triggerOnReviewSignals: event.target.checked })}
            type="checkbox"
          />
          <strong>Review signals</strong>
        </label>
        <label className="select-field">
          <span>Signal threshold</span>
          <input
            min={1}
            onChange={(event) => updatePolicy({ reviewSignalThreshold: Number(event.target.value) })}
            type="number"
            value={policy.reviewSignalThreshold}
          />
        </label>

        <label className="toggle-row">
          <input
            checked={policy.triggerOnHighUsage}
            onChange={(event) => updatePolicy({ triggerOnHighUsage: event.target.checked })}
            type="checkbox"
          />
          <strong>High usage</strong>
        </label>
        <label className="select-field">
          <span>Usage threshold GB</span>
          <input
            min={0}
            onChange={(event) => updatePolicy({ highUsageBytes: Number(event.target.value) * 1024 ** 3 })}
            type="number"
            value={highUsageGb}
          />
        </label>
      </div>
    </div>
  );
}

function SnapshotHistoryPanel({
  entries,
  filter,
  filterCounts,
  importInputRef,
  importPreview,
  onCancelImport,
  onClear,
  onConfirmImport,
  onExportArchive,
  onFilterChange,
  onImportArchive,
  onImportArchiveClick,
  onLoadCapture,
  persistedEntryIds,
  onPrune,
  selectedEntryId,
  storageLimits,
  totalCount
}: {
  entries: SnapshotHistoryEntry[];
  filter: SnapshotHistorySourceFilter;
  filterCounts: Record<SnapshotHistorySourceFilter, number>;
  importInputRef: RefObject<HTMLInputElement>;
  importPreview?: PendingSnapshotArchiveImport;
  onCancelImport: () => void;
  onClear: () => void;
  onConfirmImport: () => void;
  onExportArchive: () => void;
  onFilterChange: (filter: SnapshotHistorySourceFilter) => void;
  onImportArchive: (file?: File | null) => void;
  onImportArchiveClick: () => void;
  onLoadCapture: (entryId: string) => void;
  persistedEntryIds: string[];
  onPrune: () => void;
  selectedEntryId: string;
  storageLimits: SnapshotStorageLimits;
  totalCount: number;
}) {
  const visibleEntries = entries.slice(0, 8);
  const persistedEntryIdSet = new Set(persistedEntryIds);
  const sourceFilters: SnapshotHistorySourceFilter[] = ["all", "demo", "omada", "omada-pp"];

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Snapshot History</h3>
          <p>{visibleEntries.length} of {totalCount} recent captures.</p>
          <p>{persistedEntryIds.length} / {storageLimits.captureLimit} stored captures · {totalCount} / {storageLimits.historyLimit} retained rows.</p>
        </div>
        <div className="panel-actions">
          <button className="text-button slim" disabled={entries.length === 0} onClick={onExportArchive}>
            Export Archive
          </button>
          <button className="text-button slim" onClick={onImportArchiveClick}>
            Import Archive
          </button>
          <button className="text-button slim" disabled={totalCount === 0} onClick={onPrune}>
            Prune
          </button>
          <button className="text-button slim" disabled={totalCount === 0} onClick={onClear}>
            Clear
          </button>
          <input
            accept="application/json,.json"
            className="hidden-file-input"
            onChange={(event) => onImportArchive(event.target.files?.[0])}
            ref={importInputRef}
            type="file"
          />
        </div>
      </div>
      <div className="source-filter" aria-label="Snapshot source filter">
        {sourceFilters.map((source) => (
          <button
            className={filter === source ? "active" : ""}
            key={source}
            onClick={() => onFilterChange(source)}
            type="button"
          >
            <span>{source === "all" ? "All" : formatDeviceSourceLabel(source)}</span>
            <strong>{filterCounts[source]}</strong>
          </button>
        ))}
      </div>
      {importPreview ? (
        <SnapshotArchiveImportPreview
          onCancel={onCancelImport}
          onConfirm={onConfirmImport}
          preview={importPreview}
          storageLimits={storageLimits}
        />
      ) : null}
      <div className="list">
        {visibleEntries.length ? visibleEntries.map((entry, index) => {
          const previous = entries[index + 1];
          const delta = previous ? entry.totalBytes - previous.totalBytes : 0;
          const persisted = persistedEntryIdSet.has(entry.id);

          return (
            <button
              className={`list-item compact-item snapshot-history-row history-button ${selectedEntryId === entry.id ? "selected" : ""}`}
              disabled={!persisted}
              key={entry.id}
              onClick={() => onLoadCapture(entry.id)}
              title={persisted ? "Inspect stored capture" : "Local-only row has no stored capture detail"}
              type="button"
            >
              <div className="list-title">
                <strong>{formatDeviceSourceLabel(entry.source)}</strong>
                <span className={`metric-pill ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
                  {formatHistoryDelta(delta)}
                </span>
              </div>
              <p>
                {formatBytes(entry.totalBytes)} · {entry.onlineDevices} devices · {entry.unknownDevices} unknown
              </p>
              <p className="truncate">Top: {formatHistoryTop(entry)}</p>
              <p>
                {entry.reviewedAt ? "Reviewed" : persisted ? "Stored capture" : "Local only"} · <RelativeTime value={entry.observedAt} />
              </p>
            </button>
          );
        }) : (
          <div className="list-item compact-item">
            <p>No captures for this source.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SnapshotArchiveImportPreview({
  onCancel,
  onConfirm,
  preview,
  storageLimits
}: {
  onCancel: () => void;
  onConfirm: () => void;
  preview: PendingSnapshotArchiveImport;
  storageLimits: SnapshotStorageLimits;
}) {
  const sourceRows = Object.entries(preview.summary.sourceCounts).sort(([a], [b]) => a.localeCompare(b));
  const skippedRows = preview.summary.invalidCaptures + preview.summary.invalidEntries;
  const duplicateRows = preview.summary.duplicateCaptures + preview.summary.duplicateEntries;

  return (
    <div className="archive-import-preview">
      <div>
        <strong className="truncate">{preview.fileName}</strong>
        <span>
          {preview.summary.importableCaptures} captures · {preview.summary.importableEntries} rows
        </span>
      </div>
      <div className="archive-import-metrics">
        <span>{preview.summary.retainedCapturesAfterImport} / {storageLimits.captureLimit} captures retained</span>
        <span>{preview.summary.retainedEntriesAfterImport} / {storageLimits.historyLimit} rows retained</span>
        <span>{duplicateRows} duplicate</span>
        <span>{skippedRows} skipped</span>
      </div>
      {sourceRows.length ? (
        <div className="archive-import-sources">
          {sourceRows.map(([source, count]) => (
            <span key={source}>{formatDeviceSourceLabel(source as DeviceSnapshotSource)} {count}</span>
          ))}
        </div>
      ) : null}
      <div className="archive-import-actions">
        <button className="text-button slim" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="text-button slim primary" onClick={onConfirm} type="button">
          Confirm Import
        </button>
      </div>
    </div>
  );
}

function SnapshotReviewSignalList({ comparison }: { comparison: SnapshotCaptureComparison }) {
  return (
    <div className="snapshot-review-signals">
      <div className="device-change-header">
        <strong>Review Signals</strong>
        <span className="metric-pill">{comparison.reviewSignals.length}</span>
      </div>
      {comparison.reviewSignals.map((signal) => (
        <div className={`snapshot-review-signal ${signal.severity}`} key={signal.id}>
          <div>
            <strong>{signal.label}</strong>
            <span>{signal.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeviceChangeSummary({ comparison }: { comparison: SnapshotCaptureComparison }) {
  return (
    <div className="device-change-grid">
      <DeviceChangeList label="New" rows={comparison.newDevices} />
      <DeviceChangeList label="Missing" rows={comparison.missingDevices} />
    </div>
  );
}

function DeviceChangeList({
  label,
  rows
}: {
  label: "Missing" | "New";
  rows: SnapshotCaptureComparison["newDevices"];
}) {
  return (
    <div className="device-change-list">
      <div className="device-change-header">
        <strong>{label}</strong>
        <span className="metric-pill">{rows.length}</span>
      </div>
      {rows.length ? (
        rows.map((device) => (
          <div className="device-change-row" key={device.id}>
            <div>
              <strong className="truncate">{device.hostname}</strong>
              <span className="truncate">{device.ssid} · {device.apName} · {device.status}</span>
            </div>
            <span>{formatBytes(device.totalBytes)}</span>
          </div>
        ))
      ) : (
        <p>No devices.</p>
      )}
    </div>
  );
}

function ProfilesView({
  importedCount,
  onClearImported,
  onExportImported,
  profiles
}: {
  importedCount: number;
  onClearImported: () => void;
  onExportImported: () => void;
  profiles: Profile[];
}) {
  const [sourceFilter, setSourceFilter] = useState<"all" | ProfileSource>("all");
  const filteredProfiles = sourceFilter === "all"
    ? profiles
    : profiles.filter((profile) => getProfileSource(profile) === sourceFilter);
  const sourceCounts = {
    all: profiles.length,
    csv: profiles.filter((profile) => getProfileSource(profile) === "csv").length,
    demo: profiles.filter((profile) => getProfileSource(profile) === "demo").length
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Profiles</h3>
          <p>{filteredProfiles.length} of {profiles.length} known owners.</p>
        </div>
        <div className="panel-actions">
          <button className="text-button slim" disabled={importedCount === 0} onClick={onExportImported}>
            Export CSV
          </button>
          <button className="text-button slim danger" disabled={importedCount === 0} onClick={onClearImported}>
            Clear CSV
          </button>
          <ShieldCheck size={20} color="var(--green)" />
        </div>
      </div>
      <div className="source-filter profile-source-filter" aria-label="Profile source filter">
        {(["all", "demo", "csv"] as const).map((source) => (
          <button
            className={sourceFilter === source ? "active" : ""}
            key={source}
            onClick={() => setSourceFilter(source)}
            type="button"
          >
            <span>{source === "all" ? "All" : source.toUpperCase()}</span>
            <strong>{sourceCounts[source]}</strong>
          </button>
        ))}
      </div>
      <div className="profile-grid wide">
        {filteredProfiles.map((profile) => (
          <div className="profile-card" key={profile.id}>
            <div className="profile-card-title">
              <strong className="truncate">{profile.displayName}</strong>
              <span className="metric-pill">{getProfileSource(profile).toUpperCase()}</span>
            </div>
            <span>{profile.profileType} · {profile.profileLevel}</span>
            <span className="truncate">{profile.organizationName ?? "No organization"}</span>
          </div>
        ))}
        {filteredProfiles.length === 0 ? (
          <div className="profile-card">
            <strong>No profiles</strong>
            <span>No owners match this source.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AlertsView({
  alerts,
  onSetAlertStatus
}: {
  alerts: Alert[];
  onSetAlertStatus: (alertId: string, status: AlertStatus) => void;
}) {
  return <AlertQueue alerts={alerts} onSetAlertStatus={onSetAlertStatus} />;
}

function SettingsView({
  deliveries,
  onAddActivity,
  onDelivery,
  onImportProfiles,
  onNotice,
  onReset,
  onSettingsChange,
  settings
}: {
  deliveries: EmailDelivery[];
  onAddActivity: (message: string) => void;
  onDelivery: (delivery: EmailDelivery) => void;
  onImportProfiles: (profiles: Profile[]) => void;
  onNotice: (notice: string) => void;
  onReset: () => void;
  onSettingsChange: (settings: NotificationSettings) => void;
  settings: NotificationSettings;
}) {
  const updateSettings = (updates: Partial<NotificationSettings>) => {
    onSettingsChange({ ...settings, ...updates });
  };

  const updateRule = (ruleKey: NotificationRuleKey, updates: Partial<NotificationRule>) => {
    onSettingsChange({
      ...settings,
      rules: {
        ...settings.rules,
        [ruleKey]: {
          ...settings.rules[ruleKey],
          ...updates
        }
      }
    });
  };

  const sendTestEmail = async () => {
    const recipient = getFirstRecipient(settings.criticalRecipients) ?? getFirstRecipient(settings.digestRecipients);

    if (!recipient) {
      const delivery = createEmailDelivery({
        createdAt: new Date().toISOString(),
        error: "No test recipient configured",
        notificationType: "test_email",
        provider: settings.providerMode,
        recipient: "none",
        status: "failed"
      });
      onDelivery(delivery);
      onNotice("Recipient missing");
      onAddActivity("Test email failed: recipient missing");
      return;
    }

    try {
      const response = await fetch("/api/notifications/test", {
        body: JSON.stringify({
          fromEmail: settings.fromEmail,
          fromName: settings.fromName,
          providerMode: settings.providerMode,
          recipient,
          replyToEmail: settings.replyToEmail
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = (await response.json()) as { delivery?: EmailDelivery };
      const delivery = payload.delivery;

      if (!delivery) {
        throw new Error("Missing delivery response");
      }

      onDelivery(delivery);

      if (delivery.status === "disabled") {
        onNotice("Email disabled");
        onAddActivity("Test email skipped because delivery is disabled");
      } else if (delivery.status === "rendered") {
        onNotice("Rendered locally");
        onAddActivity(`Rendered test email for ${recipient}`);
      } else if (delivery.status === "sent") {
        onNotice("Test sent");
        onAddActivity(`Sent test email for ${recipient}`);
      } else {
        onNotice("Test failed");
        onAddActivity(`Test email failed: ${delivery.error ?? "provider error"}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      const delivery = createEmailDelivery({
        createdAt: new Date().toISOString(),
        error: message,
        notificationType: "test_email",
        provider: settings.providerMode,
        recipient,
        status: "failed"
      });
      onDelivery(delivery);
      onNotice("Test failed");
      onAddActivity(`Test email failed: ${message}`);
    }
  };

  const apiKeyConfigured = settings.providerMode === "resend" ? "Missing in demo" : "Not required";
  const domainStatus = settings.providerMode === "resend" ? "needs_verification" : "not_configured";

  return (
    <section className="settings-grid">
      <div className="panel settings-panel">
        <div className="panel-header">
          <div>
            <h3>Email</h3>
            <p>Provider and sender settings.</p>
          </div>
          <Mail size={20} color="var(--teal-dark)" />
        </div>

        <div className="form-grid">
          <label className="select-field">
            <span>Provider</span>
            <select
              value={settings.providerMode}
              onChange={(event) => updateSettings({ providerMode: event.target.value as NotificationProviderMode })}
            >
              <option value="disabled">Disabled</option>
              <option value="console">Console</option>
              <option value="resend">Resend</option>
            </select>
          </label>

          <label className="select-field">
            <span>Sender name</span>
            <input
              onChange={(event) => updateSettings({ fromName: event.target.value })}
              value={settings.fromName}
            />
          </label>

          <label className="select-field">
            <span>Sender email</span>
            <input
              onChange={(event) => updateSettings({ fromEmail: event.target.value })}
              value={settings.fromEmail}
            />
          </label>

          <label className="select-field">
            <span>Reply-to</span>
            <input
              onChange={(event) => updateSettings({ replyToEmail: event.target.value })}
              value={settings.replyToEmail}
            />
          </label>

          <label className="select-field span-2">
            <span>Digest recipients</span>
            <textarea
              onChange={(event) => updateSettings({ digestRecipients: event.target.value })}
              value={settings.digestRecipients}
            />
          </label>

          <label className="select-field span-2">
            <span>Critical recipients</span>
            <textarea
              onChange={(event) => updateSettings({ criticalRecipients: event.target.value })}
              value={settings.criticalRecipients}
            />
          </label>

          <label className="select-field">
            <span>Batch minutes</span>
            <input
              min={5}
              onChange={(event) => updateSettings({ batchSettlingMinutes: Number(event.target.value) || 30 })}
              type="number"
              value={settings.batchSettlingMinutes}
            />
          </label>
        </div>

        <div className="settings-actions">
          <button className="text-button" onClick={() => {
            onNotice("Settings saved");
            onAddActivity("Notification settings saved");
          }} title="Save settings">
            <Check size={17} />
            Save
          </button>
          <button className="text-button" onClick={sendTestEmail} title="Send test email">
            <Send size={17} />
            Test
          </button>
          <button className="text-button danger" onClick={() => updateSettings({ providerMode: "disabled" })} title="Disable email">
            <Ban size={17} />
            Disable
          </button>
          <button className="icon-button" onClick={onReset} title="Reset notification defaults">
            <RefreshCcw size={17} />
          </button>
        </div>
      </div>

      <div className="side-stack">
        <IntegrationCards onAddActivity={onAddActivity} onNotice={onNotice} />
        <NetworkProviderStatus onAddActivity={onAddActivity} onNotice={onNotice} />
        <CsvImportPreview onAddActivity={onAddActivity} onImportProfiles={onImportProfiles} onNotice={onNotice} />

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Status</h3>
              <p>Secrets stay server-side.</p>
            </div>
            <KeyRound size={20} color="var(--blue)" />
          </div>
          <dl className="kv-list status-list">
            <div>
              <dt>Provider</dt>
              <dd>{settings.providerMode}</dd>
            </div>
            <div>
              <dt>API key</dt>
              <dd>{apiKeyConfigured}</dd>
            </div>
            <div>
              <dt>Domain</dt>
              <dd>{domainStatus}</dd>
            </div>
            <div>
              <dt>Last send</dt>
              <dd><RelativeTime value={deliveries[0]?.createdAt} /></dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Rules</h3>
              <p>Alert delivery controls.</p>
            </div>
            <AlertTriangle size={20} color="var(--amber)" />
          </div>
          <div className="rule-list">
            {(Object.keys(notificationRuleLabels) as NotificationRuleKey[]).map((ruleKey) => {
              const rule = settings.rules[ruleKey];
              return (
                <div className="rule-item" key={ruleKey}>
                  <label className="toggle-row">
                    <input
                      checked={rule.enabled}
                      onChange={(event) => updateRule(ruleKey, { enabled: event.target.checked })}
                      type="checkbox"
                    />
                    <strong>{notificationRuleLabels[ruleKey]}</strong>
                  </label>
                  <div className="rule-controls">
                    <select
                      aria-label={`${notificationRuleLabels[ruleKey]} severity`}
                      value={rule.severity}
                      onChange={(event) => updateRule(ruleKey, { severity: event.target.value as NotificationRule["severity"] })}
                    >
                      <option value="info">Info</option>
                      <option value="watch">Watch</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                    <select
                      aria-label={`${notificationRuleLabels[ruleKey]} delivery`}
                      value={rule.delivery}
                      onChange={(event) => updateRule(ruleKey, { delivery: event.target.value as NotificationRule["delivery"] })}
                    >
                      <option value="digest">Digest</option>
                      <option value="immediate">Immediate</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="panel span-full">
        <div className="panel-header">
          <div>
            <h3>Delivery Log</h3>
            <p>{deliveries.length} recent attempts.</p>
          </div>
          <Activity size={20} color="var(--green)" />
        </div>
        <div className="table-scroll">
          <table className="device-table delivery-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Recipient</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((delivery) => (
              <tr key={delivery.id}>
                <td><RelativeTime value={delivery.createdAt} /></td>
                <td>{delivery.notificationType}</td>
                <td>{delivery.recipient}</td>
                <td>{delivery.provider}</td>
                <td><span className={`delivery-status ${delivery.status}`}>{delivery.status}</span></td>
                <td>{delivery.error ?? delivery.providerMessageId ?? "ok"}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function IntegrationCards({
  onAddActivity,
  onNotice
}: {
  onAddActivity: (message: string) => void;
  onNotice: (notice: string) => void;
}) {
  const [results, setResults] = useState<Record<string, IntegrationTestState>>({});

  const testIntegration = async (
    integration: IntegrationCatalogItem,
    options: { mode: "shape" | "live"; path?: string } = { mode: "shape", path: integration.testPath }
  ) => {
    setResults((current) => ({
      ...current,
      [integration.id]: {
        message: options.mode === "live" ? "Live test" : "Testing",
        status: "testing"
      }
    }));

    if (!options.path) {
      const result = {
        message: "Not configured",
        status: "error" as const,
        testedAt: new Date().toISOString()
      };
      setResults((current) => ({ ...current, [integration.id]: result }));
      onNotice("Not configured");
      onAddActivity(`${integration.name} ${options.mode} test skipped: not configured`);
      return;
    }

    try {
      const response = await fetch(options.path);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);

      const count = Array.isArray(payload.observations)
        ? payload.observations.length
        : Array.isArray(payload.snapshot?.people)
          ? payload.snapshot.people.length
          : typeof payload.count === "number"
            ? payload.count
          : 0;
      const result = {
        message: `${count} records`,
        status: "success" as const,
        testedAt: new Date().toISOString()
      };
      setResults((current) => ({ ...current, [integration.id]: result }));
      onNotice("Integration tested");
      onAddActivity(`${integration.name} ${options.mode} test returned ${count} records`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      setResults((current) => ({
        ...current,
        [integration.id]: {
          message,
          status: "error",
          testedAt: new Date().toISOString()
        }
      }));
      onNotice("Test failed");
      onAddActivity(`${integration.name} ${options.mode} test failed: ${message}`);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Integrations</h3>
          <p>Exact provider modules.</p>
        </div>
        <Wifi size={20} color="var(--teal-dark)" />
      </div>
      <div className="integration-list">
        {integrationCatalog.map((integration) => {
          const result = results[integration.id] ?? { message: "Not tested", status: "idle" as const };
          return (
            <div className="integration-item" key={integration.id}>
              <div className="integration-title">
                <div>
                  <strong>{integration.name}</strong>
                  <span>{integration.category} · {integration.description} · {formatIntegrationStatus(integration.status)}</span>
                </div>
                <span className={`integration-state ${result.status}`}>{result.message}</span>
              </div>
              <div className="integration-actions">
                <button className="text-button" onClick={() => testIntegration(integration)} title={`Test ${integration.name}`}>
                  <Check size={17} />
                  Test
                </button>
                {integration.liveTestPath ? (
                  <button
                    className="text-button"
                    onClick={() => testIntegration(integration, { mode: "live", path: integration.liveTestPath })}
                    title={`Live test ${integration.name}`}
                  >
                    <Activity size={17} />
                    Live
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatIntegrationStatus(status: IntegrationCatalogItem["status"]) {
  if (status === "demo") return "demo";
  if (status === "shape_ready") return "shape ready";
  return "planned";
}

function RelativeTime({ fallback = "none", value }: { fallback?: string; value?: string }) {
  return <span suppressHydrationWarning>{value ? formatRelativeTime(value) : fallback}</span>;
}

function NetworkProviderStatus({
  onAddActivity,
  onNotice
}: {
  onAddActivity: (message: string) => void;
  onNotice: (notice: string) => void;
}) {
  const [providers, setProviders] = useState<NetworkProviderConfigStatus[]>([]);
  const [compareState, setCompareState] = useState<IntegrationTestState>({
    message: "Not compared",
    status: "idle"
  });
  const [doctorState, setDoctorState] = useState<IntegrationTestState>({
    message: "Not checked",
    status: "idle"
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/providers/network/status")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        setProviders(payload.providers ?? []);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setProviders([]);
        setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const compareOmadaConnectors = async () => {
    setDoctorState({
      message: "Not checked",
      status: "idle"
    });
    setCompareState({
      message: "Comparing",
      status: "testing"
    });

    try {
      const response = await fetch("/api/observations/omada/compare");
      const payload = (await response.json()) as {
        cli?: { count?: number; error?: string; status?: string };
        match?: boolean;
        typescript?: { count?: number; error?: string; status?: string };
      };
      if (!response.ok || !payload.cli || !payload.typescript) {
        throw new Error(payload.cli?.error ?? payload.typescript?.error ?? "Compare failed");
      }

      const message = payload.match
        ? `Match: ${payload.typescript.count ?? 0}`
        : `TS ${payload.typescript.count ?? "?"} / CLI ${payload.cli.count ?? "?"}`;
      setCompareState({
        message,
        status: payload.match ? "success" : "error",
        testedAt: new Date().toISOString()
      });
      onNotice(payload.match ? "Connectors match" : "Connector counts differ");
      onAddActivity(`Omada connector comparison: ${message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Compare failed";
      setCompareState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      onNotice("Compare failed");
      onAddActivity(`Omada connector comparison failed: ${message}`);
    }
  };

  const runOmadaDoctor = async () => {
    setCompareState({
      message: "Not compared",
      status: "idle"
    });
    setDoctorState({
      message: "Checking",
      status: "testing"
    });

    try {
      const response = await fetch("/api/observations/omada/cli-doctor");
      const payload = (await response.json()) as {
        error?: string;
        result?: {
          checks?: Array<{ detail?: string; name: string; status: string }>;
          status?: string;
        };
      };
      const failedCheck = payload.result?.checks?.find((check) => check.status === "fail");
      if (!response.ok || payload.result?.status !== "ok") {
        throw new Error(failedCheck?.detail ?? payload.error ?? "Doctor failed");
      }

      setDoctorState({
        message: "Ready",
        status: "success",
        testedAt: new Date().toISOString()
      });
      onNotice("Omada CLI ready");
      onAddActivity("Omada Printing Press doctor: Ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Doctor failed";
      setDoctorState({
        message,
        status: "error",
        testedAt: new Date().toISOString()
      });
      onNotice("Omada CLI doctor failed");
      onAddActivity(`Omada Printing Press doctor failed: ${message}`);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Network Config</h3>
          <p>Server-side readiness.</p>
        </div>
        <Wifi size={20} color="var(--teal-dark)" />
      </div>
      <div className="status-list provider-status-list">
        {!loaded ? (
          <div className="provider-status-row">
            <strong>Loading</strong>
            <span className="integration-state testing">Checking</span>
          </div>
        ) : null}
        {loaded && providers.length === 0 ? (
          <div className="provider-status-row">
            <strong>Unavailable</strong>
            <span className="integration-state error">Error</span>
          </div>
        ) : null}
        {providers.map((provider) => (
          <div className="provider-status-row" key={provider.providerId}>
            <div>
              <strong>{provider.displayName}</strong>
              {provider.detail ? <span>{provider.detail}</span> : null}
              <span>{provider.configured ? "Required env present" : `Missing ${provider.missing.join(", ")}`}</span>
              {typeof provider.liveSnapshotsEnabled === "boolean" ? (
                <span>{provider.liveSnapshotsEnabled ? "Live snapshots enabled" : "Live snapshots disabled"}</span>
              ) : null}
              {typeof provider.liveSourceTokenRequired === "boolean" ? (
                <span>{provider.liveSourceTokenRequired ? "Live token required" : "Live token not configured"}</span>
              ) : null}
            </div>
            <div className="provider-status-actions">
              {provider.providerId === "omada-printing-press" && provider.configured ? (
                <>
                  <button className="text-button" onClick={runOmadaDoctor} title="Check Omada CLI readiness">
                    <ShieldCheck size={17} />
                    Doctor
                  </button>
                  <button className="text-button" onClick={compareOmadaConnectors} title="Compare Omada connectors">
                    <Activity size={17} />
                    Compare
                  </button>
                </>
              ) : null}
              <span
                className={`integration-state ${
                  provider.providerId === "omada-printing-press" && doctorState.status !== "idle"
                    ? doctorState.status
                    : provider.providerId === "omada-printing-press" && compareState.status !== "idle"
                      ? compareState.status
                      : provider.configured ? "success" : "idle"
                }`}
              >
                {provider.providerId === "omada-printing-press" && doctorState.status !== "idle"
                  ? doctorState.message
                  : provider.providerId === "omada-printing-press" && compareState.status !== "idle"
                  ? compareState.message
                  : provider.configured ? "Configured" : "Missing"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CsvImportPreview({
  onAddActivity,
  onImportProfiles,
  onNotice
}: {
  onAddActivity: (message: string) => void;
  onImportProfiles: (profiles: Profile[]) => void;
  onNotice: (notice: string) => void;
}) {
  const [input, setInput] = useState("name,email,company,profile_type,status\nExample Guest,guest@example.test,Example Team,guest,registered");
  const [preview, setPreview] = useState<CsvPreviewState>({
    message: "Not previewed",
    status: "idle"
  });

  const runPreview = async () => {
    setPreview({
      message: "Previewing",
      status: "previewing"
    });

    try {
      const response = await fetch("/api/profiles/csv/preview", {
        body: JSON.stringify({ input }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = (await response.json()) as {
        error?: string;
        snapshot?: CsvIdentitySnapshotPayload;
        summary?: CsvPreviewState["summary"];
      };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      if (!payload.summary || !payload.snapshot) throw new Error("CSV preview response incomplete");
      const profiles = csvSnapshotToProfiles(payload.snapshot);

      setPreview({
        message: `${payload.summary.people} people, ${payload.summary.companies} companies`,
        profiles,
        status: "success",
        summary: payload.summary
      });
      onNotice("Roster previewed");
      onAddActivity(`CSV preview parsed ${payload.summary.people} people and ${payload.summary.companies} companies`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview failed";
      setPreview({
        message,
        status: "error"
      });
      onNotice("Preview failed");
      onAddActivity(`CSV preview failed: ${message}`);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Import Preview</h3>
          <p>Paste a roster before syncing.</p>
        </div>
        <UserPlus size={20} color="var(--green)" />
      </div>
      <div className="import-preview">
        <label className="select-field">
          <span>CSV or TSV</span>
          <textarea
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setPreview({
                message: "Not previewed",
                status: "idle"
              });
            }}
          />
        </label>
        <div className="integration-title">
          <span className={`integration-state ${preview.status === "previewing" ? "testing" : preview.status}`}>{preview.message}</span>
        </div>
        <button className="text-button" onClick={runPreview} title="Preview import">
          <Eye size={17} />
          Preview
        </button>
        <button
          className="text-button primary"
          disabled={!preview.profiles?.length}
          onClick={() => {
            const profiles = preview.profiles ?? [];
            onImportProfiles(profiles);
            setPreview((current) => ({
              ...current,
              message: `Imported ${profiles.length} profiles`
            }));
          }}
          title="Import previewed roster"
        >
          <UserPlus size={17} />
          Import Roster
        </button>
      </div>
    </section>
  );
}

function DeviceLedger({
  devices,
  compact = false,
  maxUsage,
  onSelectDevice,
  profileById,
  resolutionByDeviceId,
  selectedDeviceId
}: {
  devices: Device[];
  compact?: boolean;
  maxUsage: number;
  onSelectDevice: (deviceId: string) => void;
  profileById: Map<string, Profile>;
  resolutionByDeviceId: Map<string, DeviceResolution>;
  selectedDeviceId: string;
}) {
  const shownDevices = compact ? devices.slice(0, 6) : devices;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Device Ledger</h3>
          <p>{shownDevices.length} current clients.</p>
        </div>
        <StatusBadge
          state={
            devices.some((device) => ["automation_like", "possible_bot", "needs_review", "watch"].includes(device.riskState))
              ? "needs_review"
              : "normal"
          }
        />
      </div>

      <div className="table-scroll">
        <table className="device-table ledger-table">
        <thead>
          <tr>
            <th style={{ width: "27%" }}>Device</th>
            <th style={{ width: "19%" }}>Owner</th>
            <th style={{ width: "18%" }}>Network</th>
            <th style={{ width: "17%" }}>Usage</th>
            <th style={{ width: "15%" }}>Signal</th>
              <th className="action-column" aria-label="Inspect" />
          </tr>
        </thead>
        <tbody>
          {shownDevices.map((device) => {
            const profile = device.profileId ? profileById.get(device.profileId) : undefined;
            const resolution = resolutionByDeviceId.get(device.id);
            const suggestedProfile = !profile && resolution?.profileId ? profileById.get(resolution.profileId) : undefined;
            const usage = device.rxBytes + device.txBytes;

            return (
              <tr className={selectedDeviceId === device.id ? "selected-row" : ""} key={device.id}>
                <td>
                  <div className="device-name">
                    <strong>{device.hostname}</strong>
                    <span>{device.mac} · <RelativeTime value={device.lastSeen} /></span>
                  </div>
                </td>
                <td>
                  <div className="device-name">
                    <strong>{profile?.displayName ?? suggestedProfile?.displayName ?? "Unclaimed"}</strong>
                    <span>
                      {profile?.organizationName ?? suggestedProfile?.organizationName ?? (suggestedProfile ? "Suggested profile" : "No profile yet")}
                      {resolution ? ` · ${resolution.confidence} ${resolution.confidenceScore}%` : ""}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="device-name">
                    <strong>{device.ssid}</strong>
                    <span>{device.apName}</span>
                  </div>
                </td>
                <td>
                  <div className="device-name">
                    <strong>{formatBytes(usage)}</strong>
                    <div className="usage-bar" aria-label={`${percent(usage, maxUsage)}% of max usage`}>
                      <span style={{ width: `${percent(usage, maxUsage)}%` }} />
                    </div>
                  </div>
                </td>
                <td>
                  <div className="badge-row">
                    <StatusBadge state={device.riskState} />
                    {device.privateMacSuspected ? <span className="badge watch">Private MAC</span> : null}
                  </div>
                </td>
                <td>
                  <button className="icon-button table-action" onClick={() => onSelectDevice(device.id)} title="Inspect">
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </div>
  );
}

function DeviceInspector({
  device,
  onAssignDevice,
  onBlockDevice,
  onSetDeviceRisk,
  profileById,
  profiles,
  resolution
}: {
  device: Device;
  onAssignDevice: (deviceId: string, profileId: string) => void;
  onBlockDevice: (deviceId: string) => void;
  onSetDeviceRisk: (deviceId: string, riskState: RiskState) => void;
  profileById: Map<string, Profile>;
  profiles: Profile[];
  resolution?: DeviceResolution;
}) {
  const fallbackProfileId = profiles[0]?.id ?? "";
  const suggestedProfile = !device.profileId && resolution?.profileId ? profileById.get(resolution.profileId) : undefined;
  const initialProfileId = device.profileId ?? suggestedProfile?.id ?? fallbackProfileId;
  const [selectedProfileId, setSelectedProfileId] = useState(initialProfileId);
  const profile = device.profileId ? profileById.get(device.profileId) : undefined;
  const usage = device.rxBytes + device.txBytes;
  const assignProfileId = selectedProfileId || fallbackProfileId;

  useEffect(() => {
    setSelectedProfileId(device.profileId ?? suggestedProfile?.id ?? fallbackProfileId);
  }, [device.id, device.profileId, fallbackProfileId, suggestedProfile?.id]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Inspect</h3>
          <p>{device.hostname}</p>
        </div>
        <StatusBadge state={device.riskState} />
      </div>
      <div className="detail-body">
        <div className="detail-title">
          <strong>{profile?.displayName ?? suggestedProfile?.displayName ?? "Unclaimed"}</strong>
          <span>{profile?.organizationName ?? suggestedProfile?.organizationName ?? "No owner assigned"}</span>
        </div>

        {!profile && suggestedProfile ? (
          <div className="suggestion-box">
            <div>
              <strong>Suggested owner</strong>
              <span>{suggestedProfile.displayName} · {resolution?.confidence ?? "low"} {resolution?.confidenceScore ?? 0}%</span>
            </div>
            <button className="text-button slim primary" onClick={() => onAssignDevice(device.id, suggestedProfile.id)}>
              Assign Suggested
            </button>
          </div>
        ) : null}

        {resolution ? (
          <div className="evidence-box">
            <div className="list-title">
              <strong>Resolution</strong>
              <span className={`confidence-pill ${resolution.confidence}`}>{resolution.confidence} {resolution.confidenceScore}%</span>
            </div>
            <ul>
              {resolution.evidence.map((item) => (
                <li key={`${item.type}-${item.label}`}>{item.label}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <label className="select-field">
          <span>Owner</span>
          <select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}>
            {profiles.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName}
              </option>
            ))}
          </select>
        </label>

        <dl className="kv-list">
          <div>
            <dt>MAC</dt>
            <dd>{device.mac}</dd>
          </div>
          <div>
            <dt>IP</dt>
            <dd>{device.ip}</dd>
          </div>
          <div>
            <dt>SSID</dt>
            <dd>{device.ssid}</dd>
          </div>
          <div>
            <dt>AP</dt>
            <dd>{device.apName}</dd>
          </div>
          <div>
            <dt>Usage</dt>
            <dd>{formatBytes(usage)}</dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd><RelativeTime value={device.lastSeen} /></dd>
          </div>
        </dl>

        <div className="action-grid">
          <button
            className="text-button"
            disabled={!assignProfileId}
            onClick={() => onAssignDevice(device.id, assignProfileId)}
            title="Assign owner"
          >
            <UserPlus size={17} />
            Assign
          </button>
          <button className="text-button" onClick={() => onSetDeviceRisk(device.id, "normal")} title="Mark reviewed">
            <Check size={17} />
            Reviewed
          </button>
          <button className="text-button" onClick={() => onSetDeviceRisk(device.id, "watch")} title="Watch device">
            <Eye size={17} />
            Watch
          </button>
          <button className="text-button danger" onClick={() => onBlockDevice(device.id)} title="Block device">
            <Ban size={17} />
            Block
          </button>
        </div>
      </div>
    </section>
  );
}

function EmptyPanel() {
  return (
    <section className="panel">
      <div className="list-item">
        <strong>No matching device</strong>
      </div>
    </section>
  );
}

function ProfileSuggestionQueue({
  ignoredCount,
  items,
  limit,
  onAssign,
  onBulkAssign,
  onBulkIgnore,
  onExport,
  onRestoreIgnored,
  onSelectDevice
}: {
  ignoredCount: number;
  items: ProfileSuggestionQueueItem[];
  limit?: number;
  onAssign: (item: ProfileSuggestionQueueItem) => void;
  onBulkAssign: (items: ProfileSuggestionQueueItem[]) => void;
  onBulkIgnore: (items: ProfileSuggestionQueueItem[]) => void;
  onExport: (items: ProfileSuggestionQueueItem[]) => void;
  onRestoreIgnored: () => void;
  onSelectDevice: (deviceId: string) => void;
}) {
  const [sourceFilter, setSourceFilter] = useState<ProfileSuggestionSourceFilter>("all");
  const sourceCounts = useMemo(
    () => ({
      all: items.length,
      csv: items.filter((item) => item.profileSource === "csv").length,
      demo: items.filter((item) => item.profileSource === "demo").length
    }),
    [items]
  );
  const filteredItems = sourceFilter === "all" ? items : items.filter((item) => item.profileSource === sourceFilter);
  const shownItems = typeof limit === "number" ? filteredItems.slice(0, limit) : filteredItems;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Profile Suggestions</h3>
          <p>
            {filteredItems.length} roster-based {filteredItems.length === 1 ? "match" : "matches"}
            {ignoredCount ? `, ${ignoredCount} ignored` : ""}.
          </p>
        </div>
        <UserPlus size={20} color="var(--teal-dark)" />
      </div>

      <div className="queue-filter-group compact" aria-label="Suggestion source filter">
        {(["all", "csv", "demo"] as ProfileSuggestionSourceFilter[]).map((source) => (
          <button
            className={sourceFilter === source ? "active" : ""}
            key={source}
            onClick={() => setSourceFilter(source)}
            type="button"
          >
            {source === "all" ? "All" : source.toUpperCase()}
            <strong>{sourceCounts[source]}</strong>
          </button>
        ))}
      </div>

      {shownItems.length ? (
        <>
          <div className="list suggestion-queue-list">
            {shownItems.map((item) => (
              <div className="list-item suggestion-queue-item" key={item.device.id}>
                <div className="list-title">
                  <strong>{item.device.hostname}</strong>
                  <span className={`confidence-pill ${item.confidence}`}>{item.confidence} {item.confidenceScore}%</span>
                </div>
                <p>{item.profile.displayName} · {item.profile.organizationName ?? item.profile.profileType}</p>
                <p>{item.reason} · {formatBytes(item.usage)} · {item.device.ssid}</p>
                <div className="inline-actions">
                  <span>{item.profileSource.toUpperCase()} roster</span>
                  <button onClick={() => onSelectDevice(item.device.id)} type="button">Inspect</button>
                  <button onClick={() => onAssign(item)} type="button">Assign</button>
                  <button onClick={() => onBulkIgnore([item])} type="button">Ignore</button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="text-button"
            disabled={shownItems.length === 0}
            onClick={() => onBulkAssign(shownItems)}
            type="button"
          >
            <UserPlus size={17} />
            Assign Visible
          </button>
          <button
            className="text-button"
            disabled={shownItems.length === 0}
            onClick={() => onBulkIgnore(shownItems)}
            type="button"
          >
            <Ban size={17} />
            Ignore Visible
          </button>
          <button
            className="text-button"
            disabled={shownItems.length === 0}
            onClick={() => onExport(shownItems)}
            type="button"
          >
            <Download size={17} />
            Export Visible
          </button>
        </>
      ) : (
        <div className="empty-state compact-empty">
          <strong>No profile suggestions</strong>
          <p>Import a roster or inspect unknown hostnames to build suggested owner matches.</p>
        </div>
      )}
      {ignoredCount ? (
        <button className="text-button" onClick={onRestoreIgnored} type="button">
          <RefreshCcw size={17} />
          Restore Ignored
        </button>
      ) : null}
    </section>
  );
}

function OwnerMix({ ownerMix }: { ownerMix: Array<{ label: string; value: number }> }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Owner Mix</h3>
          <p>Known profile types.</p>
        </div>
        <Users size={20} color="var(--teal-dark)" />
      </div>
      <div className="list">
        {ownerMix.map((item) => (
          <div className="list-item compact-item" key={item.label}>
            <div className="list-title">
              <strong>{item.label}</strong>
              <span className="metric-pill">{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AlertQueue({
  alerts,
  limit,
  onSetAlertStatus
}: {
  alerts: Alert[];
  limit?: number;
  onSetAlertStatus: (alertId: string, status: AlertStatus) => void;
}) {
  const shownAlerts = limit ? alerts.slice(0, limit) : alerts;
  const openAlertCount = alerts.filter((alert) => alert.status === "open").length;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Alert Queue</h3>
          <p>{openAlertCount} open items.</p>
        </div>
        <Activity size={20} color="var(--amber)" />
      </div>
      <div className="list">
        {shownAlerts.map((alert) => (
          <div className="list-item" key={alert.id}>
            <div className="list-title">
              <strong>{alert.title}</strong>
              <StatusBadge state={alert.label} />
            </div>
            <p>{alert.details}</p>
            <div className="inline-actions">
              <span>{alert.status} · <RelativeTime value={alert.openedAt} /></span>
              {alert.status !== "acknowledged" ? (
                <button onClick={() => onSetAlertStatus(alert.id, "acknowledged")}>Acknowledge</button>
              ) : null}
              {alert.status !== "resolved" ? <button onClick={() => onSetAlertStatus(alert.id, "resolved")}>Resolve</button> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivityLog({ activity }: { activity: ActivityEntry[] }) {
  const shownActivity = activity.slice(0, 5);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Activity</h3>
          <p>Recent review work.</p>
        </div>
        <Check size={20} color="var(--green)" />
      </div>
      <div className="list">
        {shownActivity.map((entry) => (
          <div className="list-item compact-item" key={entry.id}>
            <div className="list-title">
              <strong>{entry.message}</strong>
            </div>
            <p><RelativeTime value={entry.timestamp} /></p>
          </div>
        ))}
      </div>
    </section>
  );
}

function mergeNotificationSettings(settings?: Partial<NotificationSettings>) {
  if (!settings) return defaultNotificationSettings;

  return {
    ...defaultNotificationSettings,
    ...settings,
    rules: {
      ...defaultNotificationSettings.rules,
      ...(settings.rules ?? {})
    }
  };
}

function getFirstRecipient(recipients: string) {
  return recipients
    .split(/[\n,]/)
    .map((recipient) => recipient.trim())
    .filter(Boolean)[0];
}

function createEmailDelivery({
  createdAt,
  error,
  notificationType,
  provider,
  providerMessageId,
  recipient,
  status
}: Omit<EmailDelivery, "id">) {
  return {
    createdAt,
    error,
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
    notificationType,
    provider,
    providerMessageId,
    recipient,
    status
  };
}

function csvSnapshotToProfiles(snapshot: CsvIdentitySnapshotPayload): Profile[] {
  const companyById = new Map(snapshot.companies.map((company) => [company.externalId, company.displayName]));
  const now = new Date().toISOString();

  return snapshot.people.map((person) => ({
    displayName: person.displayName,
    email: person.email,
    id: `csv-${slugifyProfileId(person.externalId || person.email || person.displayName)}`,
    lastSeen: now,
    organizationName: person.companyExternalId ? companyById.get(person.companyExternalId) : undefined,
    profileLevel: person.status === "active" ? "verified" : "seen",
    source: "csv",
    profileType: person.profileHint ?? "unknown"
  }));
}

function mergeProfiles(base: Profile[], incoming: Profile[]) {
  const byId = new Map<string, Profile>();
  for (const profile of [...base, ...incoming]) {
    byId.set(profile.id, profile);
  }
  return Array.from(byId.values()).sort((a, b) => {
    const typeOrder = profileTypeSortOrder(a.profileType) - profileTypeSortOrder(b.profileType);
    return typeOrder || a.displayName.localeCompare(b.displayName);
  });
}

function getOwnerMix(profiles: Profile[]) {
  return [
    { label: "Guests", value: profiles.filter((profile) => ["guest", "drop_in", "event_attendee"].includes(profile.profileType)).length },
    { label: "Members", value: profiles.filter((profile) => profile.profileType === "customer").length },
    { label: "Staff", value: profiles.filter((profile) => profile.profileType === "staff").length },
    { label: "Agents", value: profiles.filter((profile) => profile.profileType === "agent").length }
  ];
}

function buildProfileSuggestionQueue(
  devices: Device[],
  resolutionByDeviceId: Map<string, DeviceResolution>,
  profileById: Map<string, Profile>
): ProfileSuggestionQueueItem[] {
  return devices
    .map((device) => {
      if (device.profileId) return undefined;
      const resolution = resolutionByDeviceId.get(device.id);
      if (!resolution?.profileId) return undefined;
      const profile = profileById.get(resolution.profileId);
      if (!profile) return undefined;
      const suggestionEvidence = resolution.evidence.find((item) => item.type === "suggested_profile");
      if (!suggestionEvidence) return undefined;

      return {
        confidence: resolution.confidence,
        confidenceScore: resolution.confidenceScore,
        device,
        id: `${device.id}:${profile.id}`,
        profile,
        profileSource: getProfileSource(profile),
        reason: suggestionEvidence.label.replace(/^Suggested owner:\s*/i, "Matched"),
        usage: device.rxBytes + device.txBytes
      };
    })
    .filter((item): item is ProfileSuggestionQueueItem => Boolean(item))
    .sort((a, b) => b.confidenceScore - a.confidenceScore || b.usage - a.usage || a.device.hostname.localeCompare(b.device.hostname));
}

function getProfileSource(profile: Profile): ProfileSource {
  return profile.source ?? "demo";
}

function profileTypeSortOrder(profileType: Profile["profileType"]) {
  const order: Profile["profileType"][] = ["staff", "agent", "customer", "guest", "event_attendee", "drop_in", "vendor", "machine", "unknown"];
  return order.indexOf(profileType);
}

function slugifyProfileId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "profile";
}

function toCsv(rows: string[][]) {
  return `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
}

function escapeCsvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function addActivity(setActivity: (updater: (current: ActivityEntry[]) => ActivityEntry[]) => void, message: string) {
  setActivity((current) => [
    {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
      message,
      timestamp: new Date().toISOString()
    },
    ...current
  ]);
}

function formatDeviceSourceLabel(source: DeviceSnapshotSource) {
  if (source === "omada") return "Omada";
  if (source === "omada-pp") return "Omada CLI";
  return "Demo";
}

function getDeviceSourceTitle(source: DeviceSnapshotSource, liveSourceAccess: LiveSourceAccess) {
  if (source === "demo") return "Capture Demo devices";
  if (!liveSourceAccess.loaded) return "Checking live source access";
  if (!liveSourceAccess.enabled) return "Live snapshots disabled";
  return `Capture ${formatDeviceSourceLabel(source)} devices`;
}

function isSnapshotStorageLimits(value: unknown): value is SnapshotStorageLimits {
  if (!value || typeof value !== "object") return false;
  const limits = value as Partial<SnapshotStorageLimits>;
  return (
    typeof limits.captureLimit === "number" &&
    Number.isFinite(limits.captureLimit) &&
    typeof limits.historyLimit === "number" &&
    Number.isFinite(limits.historyLimit)
  );
}

function isSnapshotArchiveImportSummary(value: unknown): value is SnapshotArchiveImportSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<SnapshotArchiveImportSummary>;
  return (
    typeof summary.duplicateCaptures === "number" &&
    Number.isFinite(summary.duplicateCaptures) &&
    typeof summary.duplicateEntries === "number" &&
    Number.isFinite(summary.duplicateEntries) &&
    typeof summary.importableCaptures === "number" &&
    Number.isFinite(summary.importableCaptures) &&
    typeof summary.importableEntries === "number" &&
    Number.isFinite(summary.importableEntries) &&
    typeof summary.invalidCaptures === "number" &&
    Number.isFinite(summary.invalidCaptures) &&
    typeof summary.invalidEntries === "number" &&
    Number.isFinite(summary.invalidEntries) &&
    typeof summary.retainedCapturesAfterImport === "number" &&
    Number.isFinite(summary.retainedCapturesAfterImport) &&
    typeof summary.retainedEntriesAfterImport === "number" &&
    Number.isFinite(summary.retainedEntriesAfterImport) &&
    Boolean(summary.sourceCounts) &&
    typeof summary.sourceCounts === "object"
  );
}

function getImportedSnapshotReviewPolicy(value: unknown): SnapshotReviewPolicy | undefined {
  const candidate = value && typeof value === "object" && "policy" in value
    ? (value as { policy?: unknown }).policy
    : value;

  if (!candidate || typeof candidate !== "object") return undefined;
  const policy = candidate as Partial<SnapshotReviewPolicy>;
  const knownKeys = [
    "highUsageBytes",
    "reviewSignalThreshold",
    "triggerOnHighUsage",
    "triggerOnReviewSignals",
    "triggerOnUnknownDevices",
    "unknownDeviceThreshold"
  ];
  const hasKnownKey = knownKeys.some((key) => key in policy);
  if (!hasKnownKey) return undefined;

  return {
    highUsageBytes:
      typeof policy.highUsageBytes === "number" && Number.isFinite(policy.highUsageBytes)
        ? policy.highUsageBytes
        : defaultSnapshotReviewPolicy.highUsageBytes,
    reviewSignalThreshold:
      typeof policy.reviewSignalThreshold === "number" && Number.isFinite(policy.reviewSignalThreshold)
        ? policy.reviewSignalThreshold
        : defaultSnapshotReviewPolicy.reviewSignalThreshold,
    triggerOnHighUsage:
      typeof policy.triggerOnHighUsage === "boolean"
        ? policy.triggerOnHighUsage
        : defaultSnapshotReviewPolicy.triggerOnHighUsage,
    triggerOnReviewSignals:
      typeof policy.triggerOnReviewSignals === "boolean"
        ? policy.triggerOnReviewSignals
        : defaultSnapshotReviewPolicy.triggerOnReviewSignals,
    triggerOnUnknownDevices:
      typeof policy.triggerOnUnknownDevices === "boolean"
        ? policy.triggerOnUnknownDevices
        : defaultSnapshotReviewPolicy.triggerOnUnknownDevices,
    unknownDeviceThreshold:
      typeof policy.unknownDeviceThreshold === "number" && Number.isFinite(policy.unknownDeviceThreshold)
        ? policy.unknownDeviceThreshold
        : defaultSnapshotReviewPolicy.unknownDeviceThreshold
  };
}

function mergeSnapshotHistory(...entrySets: SnapshotHistoryEntry[][]) {
  const entries = entrySets.flat();
  const seen = new Set<string>();

  return entries
    .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())
    .filter((entry) => {
      const key = `${entry.source}:${entry.observedAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getSnapshotHistoryCounts(entries: SnapshotHistoryEntry[]): Record<SnapshotHistorySourceFilter, number> {
  return entries.reduce(
    (counts, entry) => ({
      ...counts,
      all: counts.all + 1,
      [entry.source]: counts[entry.source] + 1
    }),
    {
      all: 0,
      demo: 0,
      omada: 0,
      "omada-pp": 0
    }
  );
}

function getSnapshotReviewQueueFilterCounts(items: SnapshotReviewQueueItem[]) {
  return items.reduce(
    (counts, item) => ({
      source: {
        ...counts.source,
        all: counts.source.all + 1,
        [item.source]: counts.source[item.source] + 1
      },
      severity: {
        ...counts.severity,
        all: counts.severity.all + 1,
        [item.severity]: counts.severity[item.severity] + 1
      }
    }),
    {
      source: {
        all: 0,
        demo: 0,
        omada: 0,
        "omada-pp": 0
      },
      severity: {
        all: 0,
        warning: 0,
        watch: 0
      }
    } satisfies {
      source: Record<SnapshotHistorySourceFilter, number>;
      severity: Record<SnapshotReviewQueueSeverityFilter, number>;
    }
  );
}

function formatHistoryDelta(delta: number) {
  if (delta > 0) return `+${formatBytes(delta)}`;
  if (delta < 0) return `-${formatBytes(Math.abs(delta))}`;
  return "Base";
}

function formatSignedNumber(delta: number) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "Base";
}

function formatSignedBytes(delta: number) {
  if (delta > 0) return `+${formatBytes(delta)}`;
  if (delta < 0) return `-${formatBytes(Math.abs(delta))}`;
  return "Base";
}

function formatShortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short"
  }).format(date);
}

function formatHistoryTop(entry: SnapshotHistoryEntry) {
  return [entry.topLocation, entry.topSsid, entry.topAp].filter(Boolean).join(" / ") || "none";
}

function formatSourceStateMessage(count: number, verification?: DeviceSnapshotVerification) {
  if (!verification?.configured) return `${count} devices`;
  const anchorLabel = verification.kind === "access_point" ? "AP anchor" : "client anchor";
  return `${count} devices / ${anchorLabel} ${verification.present ? "present" : "missing"}`;
}

function getDeviceLabel(deviceId: string, devices: Device[] = demoDevices) {
  return devices.find((device) => device.id === deviceId)?.hostname ?? "Device";
}
