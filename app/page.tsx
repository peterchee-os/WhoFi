"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Download,
  Gauge,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
  Wifi,
  type LucideIcon
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { demoAlerts, demoDevices, demoProfiles } from "@/lib/demo-data";
import { formatBytes, formatRelativeTime, percent } from "@/lib/format";
import type { Device, Profile } from "@/lib/types";

type View = "dashboard" | "devices" | "profiles" | "alerts";

const navItems: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "devices", label: "Devices", icon: Wifi },
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "alerts", label: "Alerts", icon: AlertTriangle }
];

const totalBytes = demoDevices.reduce((sum, device) => sum + device.rxBytes + device.txBytes, 0);
const unknownDevices = demoDevices.filter((device) => device.status === "unknown").length;
const automationSignals = demoDevices.filter((device) =>
  ["automation_like", "possible_bot", "known_agent", "watch"].includes(device.riskState)
).length;
const openAlerts = demoAlerts.filter((alert) => alert.status === "open").length;
const maxUsage = Math.max(...demoDevices.map((device) => device.rxBytes + device.txBytes));

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

  const filteredDevices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return demoDevices;

    return demoDevices.filter((device) => {
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
  }, [query]);

  const title = viewTitles[activeView];

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
          <p>6 devices, 5 profiles, 2 open review signals.</p>
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

        <Metrics />

        {activeView === "dashboard" ? <DashboardView devices={filteredDevices} /> : null}
        {activeView === "devices" ? <DevicesView devices={filteredDevices} /> : null}
        {activeView === "profiles" ? <ProfilesView profiles={demoProfiles} /> : null}
        {activeView === "alerts" ? <AlertsView /> : null}
      </section>
    </main>
  );
}

function Metrics() {
  return (
    <section className="metric-grid" aria-label="Current metrics">
      <div className="metric">
        <span>Online devices</span>
        <strong>{demoDevices.length}</strong>
      </div>
      <div className="metric">
        <span>Unknown devices</span>
        <strong>{unknownDevices}</strong>
      </div>
      <div className="metric">
        <span>Tracked usage</span>
        <strong>{formatBytes(totalBytes)}</strong>
      </div>
      <div className="metric">
        <span>Review signals</span>
        <strong>{openAlerts}</strong>
      </div>
    </section>
  );
}

function DashboardView({ devices }: { devices: Device[] }) {
  return (
    <section className="content-grid">
      <DeviceLedger devices={devices} compact />

      <div className="side-stack">
        <OwnerMix />
        <AlertQueue limit={3} />
        <ProfileSummary />
        <AgentSummary />
      </div>
    </section>
  );
}

function DevicesView({ devices }: { devices: Device[] }) {
  return <DeviceLedger devices={devices} />;
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

function DeviceLedger({ devices, compact = false }: { devices: Device[]; compact?: boolean }) {
  const shownDevices = compact ? devices.slice(0, 6) : devices;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Device Ledger</h3>
          <p>{shownDevices.length} current clients.</p>
        </div>
        <StatusBadge state={automationSignals > 0 ? "needs_review" : "normal"} />
      </div>

      <table className="device-table">
        <thead>
          <tr>
            <th style={{ width: "28%" }}>Device</th>
            <th style={{ width: "20%" }}>Owner</th>
            <th style={{ width: "18%" }}>Network</th>
            <th style={{ width: "18%" }}>Usage</th>
            <th style={{ width: "16%" }}>Signal</th>
          </tr>
        </thead>
        <tbody>
          {shownDevices.map((device) => {
            const profile = device.profileId ? profileById.get(device.profileId) : undefined;
            const usage = device.rxBytes + device.txBytes;

            return (
              <tr key={device.id}>
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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

function ProfileSummary() {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Profiles</h3>
          <p>{demoProfiles.length} known owners.</p>
        </div>
        <ShieldCheck size={20} color="var(--green)" />
      </div>
      <div className="profile-grid">
        {demoProfiles.map((profile) => (
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

function AgentSummary() {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Agent Identity</h3>
          <p>Registered hosts.</p>
        </div>
        <Bot size={20} color="var(--blue)" />
      </div>
      <div className="list">
        <div className="list-item">
          <div className="list-title">
            <strong>Ava Runner</strong>
            <StatusBadge state="known_agent" />
          </div>
          <p>Heartbeat current. Usage expected.</p>
        </div>
        <div className="list-item">
          <div className="list-title">
            <strong>ubuntu</strong>
            <StatusBadge state="automation_like" />
          </div>
          <p>Traffic burst detected. Identity unclaimed.</p>
        </div>
      </div>
    </section>
  );
}
