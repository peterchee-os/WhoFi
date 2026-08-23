# MVP Roadmap

Date: 2026-08-23

## Phase 0: Documentation And Repo Foundation

Goal:

Prepare the repo for public development without committing secrets or Thinkspace-specific assumptions.

Deliverables:

- engineering docs
- `.gitignore`
- `.env.example`
- `config.example.yaml`
- `SECURITY.md`
- demo fixture plan

## Phase 1: Demo Mode

Goal:

WhoFi can run locally with fake data.

Deliverables:

- local app shell
- fake network provider
- fake identity provider
- fake devices/sessions/bandwidth
- fake guests/event/drop-ins/customers/agents
- fake hackathon attendees and teams
- basic dashboard

Exit criteria:

- `docker compose up` or equivalent starts a demo.
- No external credentials required.
- Demo explains the product in five minutes.

## Phase 2: Passive Network Ledger

Goal:

Ingest real network observations without changing the customer WiFi experience.

Deliverables:

- network provider interface
- Omada telemetry spike
- device table
- observation events
- session rollups
- bandwidth by device/location/day

Exit criteria:

- list online clients from Omada
- store MAC/AP/SSID/site/traffic counters
- show unknown devices
- show top bandwidth devices

## Phase 3: Progressive Profiles

Goal:

Map devices to people/guests/events/drop-ins/customers/staff/agents.

Deliverables:

- profile table
- profile identifiers
- device owner bindings
- staff review UI
- manual assignment
- profile merge/expire/revoke flow

Exit criteria:

- staff can assign unknown MAC to a profile
- event/hackathon attendees can be represented
- hackathon teams/projects can be represented as event context
- drop-ins do not require Yardi
- customers can link to external provider records later

## Phase 4: Identity Provider Connectors

Goal:

Connect external systems where available.

Deliverables:

- identity provider interface
- Yardi Kube connector
- CSV/manual import
- normalized companies/people/contracts
- profile link suggestions

Exit criteria:

- external people/companies can be synced
- email/external id can suggest profile links
- Yardi is supported without Thinkspace hardcoding

## Phase 5: Alerts

Goal:

Make the system operationally useful.

Deliverables:

- alert rules
- alert queue
- daily digest
- acknowledgement/resolution
- usage window rollups
- automation-like signal generation
- known-agent versus automation-like labels

Initial alerts:

- unknown persistent device
- unknown high-bandwidth device
- bursty/automation-like usage
- revoked owner online
- owner conflict
- device seen wrong location
- agent host missing heartbeat
- unregistered high-bandwidth automation-like device

Important:

For MVP, use WiFi traffic-counter signals only. DNS/flow/API-provider detection is optional and should be disabled by default.

Do not market MVP as "AI detection." MVP can show bursty, bot-like, off-hours, or automation-like behavior. A device becomes a known agent only after registration, heartbeat, staff assignment, certificate/RADIUS identity, or another explicit identity source.

## Phase 6: Optional Captive Portal

Goal:

Strengthen device-to-profile binding on selected SSIDs.

Deliverables:

- portal identity flows:
  - quick guest
  - event/hackathon
  - drop-in/day-pass
  - customer
  - staff/admin
  - agent/internal host
- Omada authorization adapter
- guest pass support

Exit criteria:

- user can self-identify
- device binding is created/refreshed
- Omada can authorize client after verification

## Phase 7: Optional Collector

Goal:

Support deployments where the WiFi controller is private to the LAN.

Deliverables:

- lightweight collector
- collector token auth
- push observations to WhoFi API
- heartbeat/status reporting

## Build Rule

At every phase:

- demo data remains fake
- secrets remain outside the repo
- provider-specific code stays behind interfaces
- Thinkspace-specific config stays private
