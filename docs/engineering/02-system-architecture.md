# System Architecture

Date: 2026-08-23

## High-Level Architecture

```text
Network Provider
  -> Collector
  -> Observation Events
  -> Device Sessions
  -> Device Ledger
  -> Progressive Profiles
  -> Identity Links
  -> Usage Windows / Automation Signals
  -> Alerts / Dashboards

Identity Provider
  -> Companies / Organizations
  -> People / Members
  -> Contracts / Passes / Events
  -> Entitlement Evidence
```

## Runtime Components

### Web App

Responsibilities:

- admin dashboard
- device review
- profile review
- provider configuration
- event/guest/pass management
- alert review
- optional captive portal UI

### API

Responsibilities:

- provider connector endpoints
- collector ingestion
- profile/device APIs
- auth/session management
- alerts
- webhooks
- optional captive portal authorization flow

### Worker / Scheduler

Responsibilities:

- poll network providers
- refresh identity providers
- compute session rollups
- create alerts
- expire guest passes
- reconcile profile links

### Optional Collector

Runs inside a coworking network when controllers are not reachable from the hosted app.

Responsibilities:

- talk to local WiFi controller
- normalize observations
- push to WhoFi API
- avoid exposing controller externally

## Core Data Flow

```text
1. Collector pulls current clients from network provider.
2. Raw observation is stored.
3. MAC is normalized into a device record.
4. Device session is created or updated.
5. Bandwidth counters are rolled up.
6. Usage windows and automation-like signals are computed.
7. Identity resolver finds profile/device owner candidates.
8. Alerts are opened for unknown, high-bandwidth, automation-like, revoked, or conflicting devices.
9. Staff or user claims/links profile when appropriate.
```

## Agent / Machine Identity Flow

Known AI agents, build machines, crawlers, workflow bots, and other automation hosts should be modeled as explicit machine identities.

```text
operator registers agent host
-> assigns owner, purpose, location, and expected behavior
-> optional host heartbeat reports agent id / host label / local network identity
-> optional future RADIUS or certificate identity strengthens proof
-> WhoFi builds a behavior baseline
-> deviations become alerts, not automatic accusations
```

This mirrors the stronger commercial network-identity pattern: agent identity is declared through enrollment, certificate/RADIUS identity, or host telemetry; anomaly detection then monitors that known identity. Unknown devices with bursts are `automation_like` until they are reviewed or linked.

## Captive Portal Flow

Optional and later.

```text
client joins SSID
-> WiFi controller redirects to WhoFi portal
-> portal receives client MAC / AP / SSID / site context
-> user chooses guest, event, drop-in, customer, staff, or agent flow
-> WhoFi creates/updates profile
-> WhoFi links stronger identity when available
-> WhoFi authorizes client through network provider
```

## Identity Provider Flow

```text
provider sync
-> external companies/people/contracts/events
-> stable external ids
-> local profile links
-> active/inactive/revoked evidence
```

Yardi Kube is an initial provider, but the interface should also support Deskworks, OfficeRnD, Coworks, Nexudus, Cobot, Spacebring, and CSV/manual imports.

Hackathon/event context should work even when no coworking/property platform exists. In that case, the identity provider may simply be:

- event roster CSV
- registration export
- event code
- manual organizer check-in
- demo provider data

## Open-Source Boundary

Public repo:

- generic provider interfaces
- generic data model
- Omada connector
- Yardi Kube connector
- demo provider
- examples with fake data

Private deployment:

- real credentials
- real location mappings
- private URLs
- private database connection
- private alert destinations
- private C3Scan/Thinkspace adapter if needed
