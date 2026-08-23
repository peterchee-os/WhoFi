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
import type { Device, DeviceStatus, Profile, RiskState } from "@/lib/types";

type View = "dashboard" | "devices" | "profiles" | "alerts";

const navItems: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "devices", label: "Devices", icon: Wifi },
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "alerts", label: "Alerts", icon: AlertTriangle }
];

const openAlerts = demoAlerts.filter((alert) => alert.status === "open").length;

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

  const devices = useMemo(() => {
    return demoDevices.map((device) => ({
      ...device,
      profileId: profileOverrides[device.id] ?? device.profileId,
      status: statusOverrides[device.id] ?? device.status,
      riskState: riskOverrides[device.id] ?? device.riskState
    }));
  }, [profileOverrides, riskOverrides, statusOverrides]);

  const metrics = useMemo(() => getMetrics(devices), [devices]);
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
    setProfileOverrides((current) => ({ ...current, [deviceId]: profileId }));
    setStatusOverrides((current) => ({ ...current, [deviceId]: "claimed" }));
  };

  const setDeviceRisk = (deviceId: string, riskState: RiskState) => {
    setRiskOverrides((current) => ({ ...current, [deviceId]: riskState }));
  };

  const blockDevice = (deviceId: string) => {
    setStatusOverrides((current) => ({ ...current, [deviceId]: "revoked" }));
    setRiskOverrides((current) => ({ ...current, [deviceId]: "needs_review" }));
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
            <button className="icon-button" title="Refresh">
              <RefreshCcw size={18} />
            </button>
            <button className="text-button" title="Export">
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
        {activeView === "alerts" ? <AlertsView /> : null}
      </section>
    </main>
  );
}

function getMetrics(devices: Device[]) {
  const totalBytes = devices.reduce((sum, device) => sum + device.rxBytes + device.txBytes, 0);
  const unknownDevices = devices.filter((device) => device.status === "unknown").length;
  const reviewSignals = devices.filter((device) =>
    ["automation_like", "possible_bot", "needs_review", "watch"].includes(device.riskState)
  ).length;

  return {
    onlineDevices: devices.length,
    reviewSignals,
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
  devices,
  maxUsage,
  onAssignDevice,
  onBlockDevice,
  onSelectDevice,
  onSetDeviceRisk,
  selectedDevice,
  selectedDeviceId
}: {
  devices: Device[];
  maxUsage: number;
  onAssignDevice: (deviceId: string, profileId: string) => void;
  onBlockDevice: (deviceId: string) => void;
  onSelectDevice: (deviceId: string) => void;
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
        <AlertQueue limit={3} />
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

function AlertsView() {
  return <AlertQueue />;
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

function AlertQueue({ limit }: { limit?: number }) {
  const alerts = limit ? demoAlerts.slice(0, limit) : demoAlerts;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Alert Queue</h3>
          <p>{openAlerts} open items.</p>
        </div>
        <Activity size={20} color="var(--amber)" />
      </div>
      <div className="list">
        {alerts.map((alert) => (
          <div className="list-item" key={alert.id}>
            <div className="list-title">
              <strong>{alert.title}</strong>
              <StatusBadge state={alert.label} />
            </div>
            <p>{alert.details}</p>
            <p>{alert.status} · {formatRelativeTime(alert.openedAt)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
