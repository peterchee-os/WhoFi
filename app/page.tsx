"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  Check,
  Download,
  Eye,
  Gauge,
  KeyRound,
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
import type { Alert, AlertStatus, Device, DeviceStatus, Profile, RiskState } from "@/lib/types";

type View = "dashboard" | "devices" | "profiles" | "alerts" | "settings";
type NotificationProviderMode = "disabled" | "console" | "resend";
type EmailDeliveryStatus = "sent" | "failed" | "disabled" | "rendered";
type NotificationRuleKey =
  | "daily_digest"
  | "unknown_high_bandwidth"
  | "automation_like_burst"
  | "revoked_owner_online"
  | "known_agent_missing_heartbeat"
  | "collector_offline";

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

type ReviewState = {
  activity: ActivityEntry[];
  alertStatusOverrides: Record<string, AlertStatus>;
  emailDeliveries: EmailDelivery[];
  notificationSettings: NotificationSettings;
  profileOverrides: Record<string, string | undefined>;
  riskOverrides: Record<string, RiskState>;
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
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "alerts", label: "Alerts", icon: AlertTriangle },
  { id: "settings", label: "Settings", icon: Settings }
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
  const [notificationSettings, setNotificationSettings] = useState(defaultNotificationSettings);
  const [emailDeliveries, setEmailDeliveries] = useState(seededEmailDeliveries);
  const [profileOverrides, setProfileOverrides] = useState<Record<string, string | undefined>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, DeviceStatus>>({});
  const [riskOverrides, setRiskOverrides] = useState<Record<string, RiskState>>({});
  const [alertStatusOverrides, setAlertStatusOverrides] = useState<Record<string, AlertStatus>>({});
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
        setStatusOverrides(parsed.statusOverrides ?? {});
      } catch {
        window.localStorage.removeItem(reviewStateKey);
      }
    } else {
      setActivity([
        {
          id: "initial",
          message: "Demo snapshot loaded",
          timestamp: new Date().toISOString()
        }
      ]);
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
    stateLoaded,
    statusOverrides
  ]);

  useEffect(() => {
    if (!notice || notice === "Ready") return;

    const timeout = window.setTimeout(() => setNotice("Ready"), 2200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const devices = useMemo(() => {
    return demoDevices.map((device) => ({
      ...device,
      profileId: profileOverrides[device.id] ?? device.profileId,
      status: statusOverrides[device.id] ?? device.status,
      riskState: riskOverrides[device.id] ?? device.riskState
    }));
  }, [profileOverrides, riskOverrides, statusOverrides]);

  const alerts = useMemo(() => {
    return demoAlerts.map((alert) => ({
      ...alert,
      status: alertStatusOverrides[alert.id] ?? alert.status
    }));
  }, [alertStatusOverrides]);

  const metrics = useMemo(() => getMetrics(devices, alerts), [alerts, devices]);
  const maxUsage = useMemo(() => Math.max(...devices.map((device) => device.rxBytes + device.txBytes)), [devices]);
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

  const assignDevice = (deviceId: string, profileId: string) => {
    const profile = profileById.get(profileId);
    setProfileOverrides((current) => ({ ...current, [deviceId]: profileId }));
    setStatusOverrides((current) => ({ ...current, [deviceId]: "claimed" }));
    setNotice("Owner assigned");
    addActivity(setActivity, `Assigned ${getDeviceLabel(deviceId)} to ${profile?.displayName ?? "owner"}`);
  };

  const setDeviceRisk = (deviceId: string, riskState: RiskState) => {
    setRiskOverrides((current) => ({ ...current, [deviceId]: riskState }));
    setNotice(riskState === "normal" ? "Marked reviewed" : "Device updated");
    addActivity(setActivity, `${getDeviceLabel(deviceId)} marked ${riskState}`);
  };

  const blockDevice = (deviceId: string) => {
    setStatusOverrides((current) => ({ ...current, [deviceId]: "revoked" }));
    setRiskOverrides((current) => ({ ...current, [deviceId]: "needs_review" }));
    setNotice("Device blocked");
    addActivity(setActivity, `${getDeviceLabel(deviceId)} blocked`);
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
    window.localStorage.removeItem(reviewStateKey);
    setNotice("Reset complete");
  };

  const exportSnapshot = () => {
    const payload = {
      activity,
      alerts,
      devices,
      exportedAt: new Date().toISOString(),
      notificationSettings,
      emailDeliveries,
      profiles: demoProfiles,
      reviewState: {
        activity,
        alertStatusOverrides,
        emailDeliveries,
        notificationSettings,
        profileOverrides,
        riskOverrides,
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
            <button className="icon-button" onClick={resetDemoState} title="Reset">
              <RefreshCcw size={18} />
            </button>
            <button className="text-button" onClick={exportSnapshot} title="Export">
              <Download size={18} />
              Export
            </button>
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
              <dd>{deliveries[0] ? formatRelativeTime(deliveries[0].createdAt) : "none"}</dd>
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
                <td>{formatRelativeTime(delivery.createdAt)}</td>
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
                    <span>{device.mac} · {formatRelativeTime(device.lastSeen)}</span>
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
            <dd>{formatRelativeTime(device.lastSeen)}</dd>
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
              <span>{alert.status} · {formatRelativeTime(alert.openedAt)}</span>
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
            <p>{formatRelativeTime(entry.timestamp)}</p>
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

function getDeviceLabel(deviceId: string) {
  return demoDevices.find((device) => device.id === deviceId)?.hostname ?? "Device";
}
