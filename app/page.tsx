"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import type { Alert, AlertStatus, Device, DeviceStatus, Profile, RiskState } from "@/lib/types";

type View = "dashboard" | "devices" | "usage" | "profiles" | "alerts" | "settings";
type DeviceSnapshotSource = "demo" | "omada" | "omada-pp";
type SnapshotHistorySourceFilter = "all" | DeviceSnapshotSource;
type SnapshotReviewQueueSeverityFilter = "all" | SnapshotReviewQueueItem["severity"];
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
  summary?: {
    companies: number;
    entitlements: number;
    people: number;
  };
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

const profileById = new Map(demoProfiles.map((profile) => [profile.id, profile]));
const ownerMix = [
  { label: "Guests", value: demoProfiles.filter((profile) => ["guest", "drop_in"].includes(profile.profileType)).length },
  { label: "Members", value: demoProfiles.filter((profile) => profile.profileType === "customer").length },
  { label: "Staff", value: demoProfiles.filter((profile) => profile.profileType === "staff").length },
  { label: "Agents", value: demoProfiles.filter((profile) => profile.profileType === "agent").length }
];

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
  const [profileOverrides, setProfileOverrides] = useState<Record<string, string | undefined>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, DeviceStatus>>({});
  const [riskOverrides, setRiskOverrides] = useState<Record<string, RiskState>>({});
  const [alertStatusOverrides, setAlertStatusOverrides] = useState<Record<string, AlertStatus>>({});
  const [snapshotHistory, setSnapshotHistory] = useState<SnapshotHistoryEntry[]>([]);
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
  const resolutions = useMemo(() => resolveDevices(devices, demoProfiles), [devices]);
  const resolutionByDeviceId = useMemo(
    () => new Map(resolutions.map((resolution) => [resolution.deviceId, resolution])),
    [resolutions]
  );

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
  }, [devices, query]);

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

  const loadSnapshotCapture = async (entryId: string) => {
    setSelectedSnapshotCaptureId(entryId);
    setSnapshotCaptureState({
      message: "Loading capture",
      status: "testing"
    });

    try {
      const response = await fetch(`/api/snapshot-history/${encodeURIComponent(entryId)}`);
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
        message: "Capture loaded",
        status: "success",
        testedAt: new Date().toISOString()
      });
      setNotice("Capture loaded");
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
      snapshotHistory,
      profiles: demoProfiles,
      reviewState: {
        activity,
        alertStatusOverrides,
        emailDeliveries,
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
          <p>{metrics.onlineDevices} devices, {demoProfiles.length} profiles, {metrics.reviewSignals} review signals.</p>
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
            onAssignDevice={assignDevice}
            onBlockDevice={blockDevice}
            onSelectDevice={setSelectedDeviceId}
            onSetDeviceRisk={setDeviceRisk}
            onSetAlertStatus={setAlertStatus}
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
            onAssignDevice={assignDevice}
            onBlockDevice={blockDevice}
            onSelectDevice={setSelectedDeviceId}
            onSetDeviceRisk={setDeviceRisk}
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
            onExportSnapshotReviewQueueReport={exportSnapshotReviewQueueReport}
            onLoadSnapshotCapture={loadSnapshotCapture}
            onMarkVisibleSnapshotQueueReviewed={markVisibleSnapshotQueueReviewed}
            onSnapshotReviewNoteChange={setSnapshotReviewNoteDraft}
            onUpdateSnapshotReview={updateSelectedSnapshotReview}
            onUpdateSnapshotReviewPolicy={updateSnapshotReviewPolicy}
            onUseSelectedSnapshotCapture={useSelectedSnapshotCapture}
            persistedSnapshotCaptureIds={persistedSnapshotCaptureIds}
            reviewQueueUpdating={reviewQueueUpdating}
            selectedSnapshotComparison={selectedSnapshotComparison}
            selectedSnapshotCapture={selectedSnapshotCapture}
            selectedSnapshotCaptureId={selectedSnapshotCaptureId}
            sessionSnapshot={sessionSnapshot}
            snapshotCaptureState={snapshotCaptureState}
            snapshotHistory={snapshotHistory}
            snapshotReviewPolicy={snapshotReviewPolicy}
            snapshotReviewPolicyState={snapshotReviewPolicyState}
            snapshotReviewNoteDraft={snapshotReviewNoteDraft}
          />
        ) : null}
        {activeView === "profiles" ? <ProfilesView profiles={demoProfiles} /> : null}
        {activeView === "alerts" ? <AlertsView alerts={alerts} onSetAlertStatus={setAlertStatus} /> : null}
        {activeView === "settings" ? (
          <SettingsView
            deliveries={emailDeliveries}
            onAddActivity={(message) => addActivity(setActivity, message)}
            onDelivery={(delivery) => setEmailDeliveries((current) => [delivery, ...current].slice(0, 12))}
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
  maxUsage,
  onAssignDevice,
  onBlockDevice,
  onSelectDevice,
  onSetAlertStatus,
  onSetDeviceRisk,
  resolutionByDeviceId,
  selectedDevice,
  selectedDeviceId
}: {
  activity: ActivityEntry[];
  alerts: Alert[];
  devices: Device[];
  maxUsage: number;
  onAssignDevice: (deviceId: string, profileId: string) => void;
  onBlockDevice: (deviceId: string) => void;
  onSelectDevice: (deviceId: string) => void;
  onSetAlertStatus: (alertId: string, status: AlertStatus) => void;
  onSetDeviceRisk: (deviceId: string, riskState: RiskState) => void;
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
      />

      <div className="side-stack">
        <DeviceInspector
          device={selectedDevice}
          onAssignDevice={onAssignDevice}
          onBlockDevice={onBlockDevice}
          onSetDeviceRisk={onSetDeviceRisk}
          resolution={resolutionByDeviceId.get(selectedDevice.id)}
        />
        <OwnerMix />
        <AlertQueue alerts={alerts} limit={3} onSetAlertStatus={onSetAlertStatus} />
        <ActivityLog activity={activity} />
      </div>
    </section>
  );
}

function DevicesView({
  devices,
  maxUsage,
  onAssignDevice,
  onBlockDevice,
  onSelectDevice,
  onSetDeviceRisk,
  resolutionByDeviceId,
  selectedDeviceId
}: {
  devices: Device[];
  maxUsage: number;
  onAssignDevice: (deviceId: string, profileId: string) => void;
  onBlockDevice: (deviceId: string) => void;
  onSelectDevice: (deviceId: string) => void;
  onSetDeviceRisk: (deviceId: string, riskState: RiskState) => void;
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
            resolution={resolutionByDeviceId.get(selectedDevice.id)}
          />
        ) : (
          <EmptyPanel />
        )}
      </div>
    </section>
  );
}

function UsageView({
  onClearSnapshotHistory,
  onDeleteSelectedSnapshotCapture,
  onExportSelectedSnapshotCapture,
  onExportSelectedSnapshotReport,
  onExportSnapshotReviewQueueReport,
  onLoadSnapshotCapture,
  onMarkVisibleSnapshotQueueReviewed,
  onSnapshotReviewNoteChange,
  onUpdateSnapshotReview,
  onUpdateSnapshotReviewPolicy,
  onUseSelectedSnapshotCapture,
  persistedSnapshotCaptureIds,
  reviewQueueUpdating,
  selectedSnapshotComparison,
  selectedSnapshotCapture,
  selectedSnapshotCaptureId,
  sessionSnapshot,
  snapshotCaptureState,
  snapshotHistory,
  snapshotReviewPolicy,
  snapshotReviewPolicyState,
  snapshotReviewNoteDraft
}: {
  onClearSnapshotHistory: () => void;
  onDeleteSelectedSnapshotCapture: () => void;
  onExportSelectedSnapshotCapture: () => void;
  onExportSelectedSnapshotReport: () => void;
  onExportSnapshotReviewQueueReport: (
    sourceFilter: SnapshotHistorySourceFilter,
    severityFilter: SnapshotReviewQueueSeverityFilter
  ) => void;
  onLoadSnapshotCapture: (entryId: string) => void;
  onMarkVisibleSnapshotQueueReviewed: (ids: string[]) => void;
  onSnapshotReviewNoteChange: (value: string) => void;
  onUpdateSnapshotReview: (reviewed?: boolean) => void;
  onUpdateSnapshotReviewPolicy: (policy: SnapshotReviewPolicy) => void;
  onUseSelectedSnapshotCapture: () => void;
  persistedSnapshotCaptureIds: string[];
  reviewQueueUpdating: boolean;
  selectedSnapshotComparison?: SnapshotCaptureComparison;
  selectedSnapshotCapture?: SnapshotCaptureRecord;
  selectedSnapshotCaptureId: string;
  sessionSnapshot: SessionSnapshot;
  snapshotCaptureState: IntegrationTestState;
  snapshotHistory: SnapshotHistoryEntry[];
  snapshotReviewPolicy: SnapshotReviewPolicy;
  snapshotReviewPolicyState: IntegrationTestState;
  snapshotReviewNoteDraft: string;
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
          onChange={onUpdateSnapshotReviewPolicy}
          policy={snapshotReviewPolicy}
          state={snapshotReviewPolicyState}
        />

        <SnapshotHistoryPanel
          entries={filteredSnapshotHistory}
          filter={historySourceFilter}
          filterCounts={snapshotHistoryCounts}
          onClear={onClearSnapshotHistory}
          onFilterChange={setHistorySourceFilter}
          onLoadCapture={onLoadSnapshotCapture}
          persistedEntryIds={persistedSnapshotCaptureIds}
          selectedEntryId={selectedSnapshotCaptureId}
          totalCount={snapshotHistory.length}
        />
      </div>

      <div className="usage-rollup-grid">
        <SnapshotCapturePanel
          capture={selectedSnapshotCapture}
          comparison={selectedSnapshotComparison}
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

function SnapshotCapturePanel({
  capture,
  comparison,
  onDelete,
  onExport,
  onExportReport,
  onReviewNoteChange,
  onUpdateReview,
  onUseCapture,
  reviewNoteDraft,
  state
}: {
  capture?: SnapshotCaptureRecord;
  comparison?: SnapshotCaptureComparison;
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
  onChange,
  policy,
  state
}: {
  onChange: (policy: SnapshotReviewPolicy) => void;
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
  onClear,
  onFilterChange,
  onLoadCapture,
  persistedEntryIds,
  selectedEntryId,
  totalCount
}: {
  entries: SnapshotHistoryEntry[];
  filter: SnapshotHistorySourceFilter;
  filterCounts: Record<SnapshotHistorySourceFilter, number>;
  onClear: () => void;
  onFilterChange: (filter: SnapshotHistorySourceFilter) => void;
  onLoadCapture: (entryId: string) => void;
  persistedEntryIds: string[];
  selectedEntryId: string;
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
        </div>
        <button className="text-button slim" disabled={totalCount === 0} onClick={onClear}>
          Clear
        </button>
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

function ProfilesView({ profiles }: { profiles: Profile[] }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Profiles</h3>
          <p>{profiles.length} known owners.</p>
        </div>
        <ShieldCheck size={20} color="var(--green)" />
      </div>
      <div className="profile-grid wide">
        {profiles.map((profile) => (
          <div className="profile-card" key={profile.id}>
            <strong className="truncate">{profile.displayName}</strong>
            <span>{profile.profileType} · {profile.profileLevel}</span>
            <span className="truncate">{profile.organizationName ?? "No organization"}</span>
          </div>
        ))}
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
  onNotice,
  onReset,
  onSettingsChange,
  settings
}: {
  deliveries: EmailDelivery[];
  onAddActivity: (message: string) => void;
  onDelivery: (delivery: EmailDelivery) => void;
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
        <CsvImportPreview onAddActivity={onAddActivity} onNotice={onNotice} />

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
  onNotice
}: {
  onAddActivity: (message: string) => void;
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);

      setPreview({
        message: `${payload.summary.people} people, ${payload.summary.companies} companies`,
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
          <textarea value={input} onChange={(event) => setInput(event.target.value)} />
        </label>
        <div className="integration-title">
          <span className={`integration-state ${preview.status === "previewing" ? "testing" : preview.status}`}>{preview.message}</span>
        </div>
        <button className="text-button" onClick={runPreview} title="Preview import">
          <Eye size={17} />
          Preview
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
  resolutionByDeviceId,
  selectedDeviceId
}: {
  devices: Device[];
  compact?: boolean;
  maxUsage: number;
  onSelectDevice: (deviceId: string) => void;
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
                    <strong>{profile?.displayName ?? "Unclaimed"}</strong>
                    <span>
                      {profile?.organizationName ?? "No profile yet"}
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
  resolution
}: {
  device: Device;
  onAssignDevice: (deviceId: string, profileId: string) => void;
  onBlockDevice: (deviceId: string) => void;
  onSetDeviceRisk: (deviceId: string, riskState: RiskState) => void;
  resolution?: DeviceResolution;
}) {
  const [selectedProfileId, setSelectedProfileId] = useState(device.profileId ?? demoProfiles[0].id);
  const profile = device.profileId ? profileById.get(device.profileId) : undefined;
  const usage = device.rxBytes + device.txBytes;
  const assignProfileId = selectedProfileId || demoProfiles[0].id;

  useEffect(() => {
    setSelectedProfileId(device.profileId ?? demoProfiles[0].id);
  }, [device.id, device.profileId]);

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
          <strong>{profile?.displayName ?? "Unclaimed"}</strong>
          <span>{profile?.organizationName ?? "No owner assigned"}</span>
        </div>

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
            {demoProfiles.map((candidate) => (
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
          <button className="text-button" onClick={() => onAssignDevice(device.id, assignProfileId)} title="Assign owner">
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

function OwnerMix() {
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
