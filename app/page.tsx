import {
  Activity,
  AlertTriangle,
  Bot,
  Building2,
  Download,
  Gauge,
  RadioTower,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
  Wifi
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { demoAlerts, demoDevices, demoEvents, demoProfiles } from "@/lib/demo-data";
import { formatBytes, formatRelativeTime, percent } from "@/lib/format";

const totalBytes = demoDevices.reduce((sum, device) => sum + device.rxBytes + device.txBytes, 0);
const unknownDevices = demoDevices.filter((device) => device.status === "unknown").length;
const automationSignals = demoDevices.filter((device) =>
  ["automation_like", "possible_bot", "known_agent", "watch"].includes(device.riskState)
).length;
const openAlerts = demoAlerts.filter((alert) => alert.status === "open").length;
const maxUsage = Math.max(...demoDevices.map((device) => device.rxBytes + device.txBytes));

const profileById = new Map(demoProfiles.map((profile) => [profile.id, profile]));

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">W</div>
          <div>
            <h1>WhoFi</h1>
            <p className="muted">Demo mode</p>
          </div>
        </div>

        <nav className="nav" aria-label="Primary">
          <button className="nav-item active" title="Dashboard">
            <Gauge size={18} />
            Dashboard
          </button>
          <button className="nav-item" title="Devices">
            <Wifi size={18} />
            Devices
          </button>
          <button className="nav-item" title="Profiles">
            <Users size={18} />
            Profiles
          </button>
          <button className="nav-item" title="Alerts">
            <AlertTriangle size={18} />
            Alerts
          </button>
        </nav>

        <div className="sidebar-section">
          <p>GWA Build Night</p>
          <p>82 attendees, 14 teams, 6 active demo devices, 3 review signals.</p>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div>
            <h2>WiFi Identity Ledger</h2>
            <p>Coworking, hackathon, event, and guest network visibility.</p>
          </div>
          <div className="toolbar">
            <div className="segmented" aria-label="Mode">
              <button className="active">Event</button>
              <button>Coworking</button>
              <button>Home</button>
            </div>
            <button className="icon-button" title="Search">
              <Search size={18} />
            </button>
            <button className="icon-button" title="Refresh">
              <RefreshCcw size={18} />
            </button>
            <button className="text-button" title="Export demo report">
              <Download size={18} />
              Export
            </button>
          </div>
        </header>

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

        <section className="content-grid">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h3>Live Device Ledger</h3>
                <p>Demo observations normalized from a WiFi controller.</p>
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
                {demoDevices.map((device) => {
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

          <div className="side-stack">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h3>Event Context</h3>
                  <p>Hackathon roster and team metadata.</p>
                </div>
                <Building2 size={20} color="var(--teal-dark)" />
              </div>
              <div className="list">
                {demoEvents.map((event) => (
                  <div className="list-item" key={event.id}>
                    <div className="list-title">
                      <strong>{event.name}</strong>
                      <span className="badge known_agent">{event.type}</span>
                    </div>
                    <p>{event.location} · {event.attendeeCount} attendees · {event.teamCount} teams</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h3>Alert Queue</h3>
                  <p>Behavioral labels stay reviewable.</p>
                </div>
                <Activity size={20} color="var(--amber)" />
              </div>
              <div className="list">
                {demoAlerts.map((alert) => (
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

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h3>Progressive Profiles</h3>
                  <p>People, companies, guests, teams, and agents.</p>
                </div>
                <ShieldCheck size={20} color="var(--green)" />
              </div>
              <div className="profile-grid">
                {demoProfiles.map((profile) => (
                  <div className="profile-card" key={profile.id}>
                    <strong className="truncate">{profile.displayName}</strong>
                    <span>{profile.profileType} · {profile.profileLevel}</span>
                    <span className="truncate">{profile.teamName ?? profile.organizationName ?? "No organization"}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h3>Agent Identity</h3>
                  <p>Known agent requires explicit evidence.</p>
                </div>
                <Bot size={20} color="var(--blue)" />
              </div>
              <div className="list">
                <div className="list-item">
                  <div className="list-title">
                    <strong>Ava Runner</strong>
                    <StatusBadge state="known_agent" />
                  </div>
                  <p>Registered host, current heartbeat, high bandwidth expected.</p>
                </div>
                <div className="list-item">
                  <div className="list-title">
                    <strong>ubuntu</strong>
                    <StatusBadge state="automation_like" />
                  </div>
                  <p>Traffic burst detected. Not labeled AI without identity evidence.</p>
                </div>
              </div>
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}
