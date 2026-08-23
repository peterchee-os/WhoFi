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
  RefreshCcw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  Wifi,
  type LucideIcon
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { demoAlerts, demoDevices, demoProfiles } from "@/lib/demo-data";
import { formatBytes, formatRelativeTime, percent } from "@/lib/format";
import type { Alert, AlertStatus, Device, DeviceStatus, Profile, RiskState } from "@/lib/types";

type View = "dashboard" | "devices" | "profiles" | "alerts";
type ReviewState = {
  activity: ActivityEntry[];
  alertStatusOverrides: Record<string, AlertStatus>;
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
  { id: "alerts", label: "Alerts", icon: AlertTriangle }
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
  }
};

export default function Home() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [query, setQuery] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("dev-unknown-burst");
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
      profileOverrides,
      riskOverrides,
      statusOverrides
    };
    window.localStorage.setItem(reviewStateKey, JSON.stringify(nextState));
  }, [activity, alertStatusOverrides, profileOverrides, riskOverrides, stateLoaded, statusOverrides]);

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
      profiles: demoProfiles,
      reviewState: {
        activity,
        alertStatusOverrides,
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
            selectedDeviceId={selectedDeviceId}
          />
        ) : null}
        {activeView === "profiles" ? <ProfilesView profiles={demoProfiles} /> : null}
        {activeView === "alerts" ? <AlertsView alerts={alerts} onSetAlertStatus={setAlertStatus} /> : null}
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
        selectedDeviceId={selectedDeviceId}
      />

      <div className="side-stack">
        <DeviceInspector
          device={selectedDevice}
          onAssignDevice={onAssignDevice}
          onBlockDevice={onBlockDevice}
          onSetDeviceRisk={onSetDeviceRisk}
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
  selectedDeviceId
}: {
  devices: Device[];
  maxUsage: number;
  onAssignDevice: (deviceId: string, profileId: string) => void;
  onBlockDevice: (deviceId: string) => void;
  onSelectDevice: (deviceId: string) => void;
  onSetDeviceRisk: (deviceId: string, riskState: RiskState) => void;
  selectedDeviceId: string;
}) {
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? devices[0];

  return (
    <section className="content-grid detail-layout">
      <DeviceLedger devices={devices} maxUsage={maxUsage} onSelectDevice={onSelectDevice} selectedDeviceId={selectedDeviceId} />
      <div className="side-stack">
        {selectedDevice ? (
          <DeviceInspector
            device={selectedDevice}
            onAssignDevice={onAssignDevice}
            onBlockDevice={onBlockDevice}
            onSetDeviceRisk={onSetDeviceRisk}
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

function DeviceLedger({
  devices,
  compact = false,
  maxUsage,
  onSelectDevice,
  selectedDeviceId
}: {
  devices: Device[];
  compact?: boolean;
  maxUsage: number;
  onSelectDevice: (deviceId: string) => void;
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

      <table className="device-table">
        <thead>
          <tr>
            <th style={{ width: "27%" }}>Device</th>
            <th style={{ width: "19%" }}>Owner</th>
            <th style={{ width: "18%" }}>Network</th>
            <th style={{ width: "17%" }}>Usage</th>
            <th style={{ width: "15%" }}>Signal</th>
            <th style={{ width: "4%" }} aria-label="Inspect" />
          </tr>
        </thead>
        <tbody>
          {shownDevices.map((device) => {
            const profile = device.profileId ? profileById.get(device.profileId) : undefined;
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
                    <span>{profile?.organizationName ?? "No profile yet"}</span>
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
  );
}

function DeviceInspector({
  device,
  onAssignDevice,
  onBlockDevice,
  onSetDeviceRisk
}: {
  device: Device;
  onAssignDevice: (deviceId: string, profileId: string) => void;
  onBlockDevice: (deviceId: string) => void;
  onSetDeviceRisk: (deviceId: string, riskState: RiskState) => void;
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
