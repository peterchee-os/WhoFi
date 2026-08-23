# Automation And AI-Like Usage Detection

Date: 2026-08-23

## Goal

Detect devices that behave like bots, scripts, crawlers, build workers, AI agents, or other automation based on usage patterns.

WhoFi should avoid pretending it can magically identify "AI" from WiFi alone. The correct language is:

```text
automation-like behavior
bot-like behavior
agent-host evidence
AI/API-heavy usage when supported by optional signals
```

## Design Rule

Separate identity from behavior.

```text
known_agent = explicit identity evidence
automation_like = behavioral evidence
possible_bot = stronger behavioral evidence, still reviewable
needs_review = ambiguous signal
```

IronWiFi's current AI-agent positioning is useful prior art here. Their model is not "guess AI from bandwidth." It is closer to:

```text
register agent
-> authenticate with certificate / 802.1X / RADIUS identity
-> assign purpose-scoped network policy
-> build behavior baseline
-> alert or quarantine on deviations
```

WhoFi should borrow the honest part of that model while staying coworking-sized: declared machine identity where available, transparent behavioral alerts where it is not.

## What Network Telemetry Can And Cannot Tell Us

### Omada / WiFi Telemetry Can Usually Tell Us

- device MAC
- IP
- hostname when available
- SSID/AP/site/location
- online/offline state
- session duration
- traffic counters
- traffic bursts by polling interval
- rough upload/download profile

This is enough to detect:

- unusual bandwidth spikes
- sustained high throughput
- off-hours activity
- repeated connect/disconnect loops
- unknown device consuming lots of traffic
- device behavior changing sharply from baseline

### WiFi Telemetry Alone Usually Cannot Tell Us

- number of HTTP/API requests
- destination domains
- packet contents
- whether traffic is OpenAI/Anthropic/GitHub/etc.
- whether a process is human-driven or agent-driven
- browser user agent
- application name

Those require optional data sources such as DNS logs, gateway/firewall flow logs, proxy logs, app logs, or endpoint/agent heartbeat.

## Signal Sources

### Tier 1: Passive WiFi Signals

Available from network client polling.

Signals:

- bytes per minute
- upload/download ratio
- burstiness score
- session duration
- online during closed/off-hours windows
- reconnect frequency
- new device + high traffic
- unknown owner + high traffic

Use:

- low-friction anomaly detection
- works with Omada-only MVP

### Tier 2: Gateway / Flow Signals

Optional and deployment-specific.

Signals:

- connection count per minute
- unique destination count
- destination ports
- protocol mix
- failed connection spikes
- scanning-like behavior
- long-running outbound sessions

Use:

- stronger bot/automation detection
- still no packet contents required

### Tier 3: DNS Signals

Optional and privacy-sensitive.

Signals:

- DNS query rate
- repeated API/service domains
- known AI/provider domains
- failed lookup spikes
- many unique domains in short window

Use:

- detect API-heavy automation
- detect AI-agent/tooling hosts more confidently

Privacy note:

DNS data can become browsing-history-like. If supported, make it opt-in, retention-limited, and aggregate where possible.

### Tier 4: Agent Host Heartbeat

Optional but best for known AI/automation hosts.

Signals:

- agent id
- host label
- project/process label
- heartbeat timestamp
- declared activity mode
- local IP/MAC

Use:

- distinguish "known agent host working normally" from "unknown device acting automated"
- show which agent/host is consuming bandwidth

### Tier 5: RADIUS / Certificate Identity

Optional and later. Useful for environments that want stronger machine identity without relying only on MAC address.

Signals:

- RADIUS username or identity
- certificate fingerprint
- certificate subject / purpose metadata
- authentication success/failure events
- assigned VLAN or policy
- Change of Authorization / quarantine event

Use:

- high-confidence known agent identity
- staff/dev/agent network segmentation
- stronger revocation path than captive portal or manual blocking

This tier is not required for the coworking/hackathon MVP.

## Proposed Tables

These are design sketches.

### `usage_window`

Aggregated network usage per device over a fixed window.

```sql
usage_window (
  id uuid primary key,
  device_id uuid not null,
  profile_id uuid,
  location_id uuid,
  window_start timestamptz not null,
  window_end timestamptz not null,
  rx_bytes bigint not null default 0,
  tx_bytes bigint not null default 0,
  total_bytes bigint not null default 0,
  avg_bytes_per_second numeric,
  max_bytes_per_second numeric,
  burst_score numeric,
  session_count integer not null default 0,
  reconnect_count integer not null default 0,
  source text not null default 'network',
  created_at timestamptz not null default now()
)
```

### `automation_signal`

Append-only signal records that explain why WhoFi thinks a device looks automated.

```sql
automation_signal (
  id uuid primary key,
  device_id uuid not null,
  profile_id uuid,
  signal_type text not null,
  severity text not null default 'info',
  score numeric,
  observed_at timestamptz not null,
  window_start timestamptz,
  window_end timestamptz,
  evidence jsonb not null default '{}',
  source text not null,
  created_at timestamptz not null default now()
)
```

Signal types:

- `traffic_burst`
- `sustained_high_bandwidth`
- `off_hours_activity`
- `unknown_high_bandwidth`
- `many_short_sessions`
- `reconnect_loop`
- `high_destination_count`
- `high_dns_query_rate`
- `known_ai_api_domains`
- `agent_heartbeat_missing`
- `agent_heartbeat_mismatch`
- `agent_identity_registered`
- `agent_certificate_changed`
- `agent_new_network_segment`
- `agent_auth_rate_spike`
- `possible_port_scan`

### `device_behavior_baseline`

Rolling baseline per device/profile.

```sql
device_behavior_baseline (
  id uuid primary key,
  device_id uuid not null,
  profile_id uuid,
  baseline_period text not null,
  avg_daily_bytes bigint,
  p95_daily_bytes bigint,
  avg_active_minutes integer,
  common_locations jsonb not null default '[]',
  common_ssids jsonb not null default '[]',
  common_hours jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique (device_id, baseline_period)
)
```

### `agent_identity`

Optional table for known machine/agent hosts.

```sql
agent_identity (
  id uuid primary key,
  profile_id uuid,
  device_id uuid,
  agent_id text not null,
  host_label text,
  owner_profile_id uuid,
  purpose text,
  autonomy_level text,
  expected_locations jsonb not null default '[]',
  expected_ssids jsonb not null default '[]',
  expected_hours jsonb not null default '[]',
  heartbeat_required boolean not null default false,
  status text not null default 'active',
  registered_at timestamptz not null default now(),
  last_heartbeat_at timestamptz,
  external_refs jsonb not null default '{}',
  unique (agent_id)
)
```

Autonomy levels:

- `api_client`
- `service_account`
- `developer_agent`
- `autonomous`
- `orchestrator`
- `unknown`

### `agent_identity_evidence`

Append-only proof used to justify `known_agent`.

```sql
agent_identity_evidence (
  id uuid primary key,
  agent_identity_id uuid not null,
  device_id uuid,
  evidence_type text not null,
  observed_at timestamptz not null,
  confidence text not null default 'medium',
  evidence jsonb not null default '{}',
  source text not null,
  created_at timestamptz not null default now()
)
```

Evidence types:

- `manual_registration`
- `staff_assignment`
- `agent_heartbeat`
- `endpoint_signal`
- `radius_identity`
- `certificate_fingerprint`
- `captive_portal_agent_flow`

## Scoring Model

Use a transparent rules-based score before ML.

Example:

```text
automation_score =
  traffic_burst_weight
  + sustained_bandwidth_weight
  + off_hours_weight
  + unknown_owner_weight
  + high_destination_count_weight
  + dns_query_rate_weight
  + agent_heartbeat_mismatch_weight
```

Labels:

- `normal`
- `watch`
- `automation_like`
- `possible_bot`
- `known_agent`
- `needs_review`

Important:

Do not label something as "AI" unless there is evidence from:

- registered agent host
- agent heartbeat
- RADIUS/certificate identity
- operator-owned endpoint signal
- optional DNS/flow evidence to AI/API services
- staff confirmation

## Example Rules

### Unknown High-Bandwidth Device

```text
IF device owner is unknown
AND total_bytes > threshold
AND window <= 1 day
THEN alert unknown_high_bandwidth
```

### Burst Rate

```text
IF max_bytes_per_second > 10x rolling p95
AND total_bytes > minimum volume
THEN automation_signal traffic_burst
```

### Off-Hours Automation

```text
IF device active outside location open hours
AND device is unknown or guest
AND usage exceeds threshold
THEN automation_signal off_hours_activity
```

### Known Agent Host Missing Heartbeat

```text
IF device owner_type = agent
AND network activity seen
AND no heartbeat within expected interval
THEN automation_signal agent_heartbeat_missing
```

### AI/API Heavy Usage

Only when optional DNS/flow integration is enabled:

```text
IF device has high request/destination rate
AND repeated traffic to configured AI/API provider domains
AND profile is not registered agent/staff/dev
THEN automation_signal known_ai_api_domains
```

### Known Agent Identity

```text
IF device has active agent_identity
AND recent agent_identity_evidence exists
THEN label known_agent
```

### Agent Certificate Changed

Only when RADIUS/certificate identity is configured:

```text
IF agent identity is known
AND certificate fingerprint changes unexpectedly
THEN automation_signal agent_certificate_changed
```

### Agent New Network Segment

```text
IF known agent host appears on unexpected SSID/location/AP group
THEN automation_signal agent_new_network_segment
```

## Dashboard Additions

Automation view:

- automation-like devices now
- unknown high-bandwidth devices
- burstiest devices today
- off-hours active devices
- known agent hosts and last heartbeat
- known agent identity evidence
- devices with changed behavior baseline

Device detail:

- usage timeline
- burst windows
- automation signals
- owner/profile
- known/unknown status
- agent heartbeat status
- review actions

## Privacy Boundary

Default WhoFi should use Tier 1 WiFi signals only.

Optional flow/DNS integrations must be explicit:

- disabled by default
- documented in deployment config
- retention-limited
- visible to operators
- no packet payload capture

For home users, keep the default very simple:

```text
guest/device/bandwidth/burst visibility
```

For coworking/hackathons, optionally add event/team context and thresholds.

For known AI/dev infrastructure, use agent heartbeat rather than spying on personal devices.

## Competitive / Prior-Art Notes

IronWiFi's public AI-agent material frames agent network identity around certificate-based 802.1X authentication, purpose-scoped VLANs, behavior baselines, anomaly detection, and lifecycle management. Their AI Center also describes analyzing authentication events, connection metadata, device fingerprints, usage patterns, and network health metrics, with no packet-content inspection.

WhoFi should treat that as a useful north star, but not copy the enterprise posture into the MVP. The practical coworking/hackathon version is:

```text
known agent when enrolled
automation-like when behavior is odd
staff review before strong claims
optional RADIUS/cert identity later
```

References:

- https://www.ironwifi.com/ai-agent-identity
- https://www.ironwifi.com/ai-center/
- https://www.ironwifi.com/platform
