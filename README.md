# WhoFi

Who is on the WiFi?

WhoFi is an open-source WiFi identity ledger for coworking spaces, hackathons, events, and guest networks. It helps operators understand which devices are on the network, who they likely belong to, whether they are a guest, registered member, staff device, company device, or known agent host, and how much bandwidth they consume.

The project is intentionally not a Fortune 100 NAC platform. It starts with visibility, progressive identity, and useful alerts before adding enforcement.

WhoFi is not passwordless WiFi onboarding in the MVP. It is passwordless-ready: it can observe and map devices on an existing network today, then later plug into captive portal, Passpoint, iPSK, RADIUS/EAP-TLS, or controller authorization flows when an operator wants access control.

WhoFi should distinguish between:

- `known_agent`: a registered machine/agent host with explicit identity evidence
- `automation_like`: a device whose network behavior looks scripted, bursty, or unusual
- `needs_review`: a device where the signal is not strong enough to classify

WiFi counters alone should not be treated as proof that a device is running AI.

## Core Idea

```text
network observations
-> device ledger
-> progressive profiles
-> guest/member/staff/company/agent context
-> optional coworking/property-system links
-> bandwidth and anomaly visibility
-> optional passwordless onboarding, captive portal, or enforcement
```

## Intended Users

- coworking operators
- flexible office operators
- event/hackathon hosts
- hackathon organizers
- meetup and workshop organizers
- IT teams managing Omada/UniFi/Meraki-style WiFi
- vendors that want to integrate Deskworks, OfficeRnD, Coworks, Yardi, Nexudus, Cobot, Spacebring, or similar systems

## Deployment Modes

WhoFi should support:

- local/demo mode for development, conference demos, and very small operators
- hosted/self-hosted production mode with a persistent database, scheduled collectors, alerts, and optional captive portal
- optional collector mode for networks where the WiFi controller is only reachable from inside the coworking LAN

The current demo app includes device review, source switching, notification settings, provider readiness, usage rollups by location/SSID/AP, browser-local snapshot history, and optional admin authentication for hosted/live-network use.

## Admin Gate

Demo mode is open by default. Hosted deployments that can reach live WiFi providers should set:

```text
WHOFI_REQUIRE_ADMIN_AUTH=true
WHOFI_ADMIN_PASSWORD=...
WHOFI_ADMIN_SESSION_SECRET=...
```

When enabled, the app shows an admin sign-in screen before exposing the dashboard. Sensitive provider and live snapshot routes also require the signed admin session. `WHOFI_LIVE_DEVICE_SOURCE_TOKEN` remains a separate per-request live snapshot token, useful for an extra operator-controlled gate around real client data.

## Repository Principle

This repo must be safe to publish.

Do not commit:

- API keys
- OAuth client secrets
- WiFi controller credentials
- real MAC addresses
- real customer/member/person data
- real internal IP addresses
- private deployment config

Real deployments should inject secrets through environment variables or a private deployment overlay.

## Engineering Docs

Start here:

- [Engineering Overview](docs/engineering/README.md)
- [Product Principles](docs/engineering/01-product-principles.md)
- [System Architecture](docs/engineering/02-system-architecture.md)
- [Data Model](docs/engineering/03-data-model.md)
- [Provider Connectors](docs/engineering/04-provider-connectors.md)
- [Deployment And Config](docs/engineering/05-deployment-and-config.md)
- [Security And Privacy](docs/engineering/06-security-and-privacy.md)
- [MVP Roadmap](docs/engineering/07-mvp-roadmap.md)
- [Prior Art And Competitive Open Source](docs/engineering/08-prior-art.md)
- [Automation And AI-Like Usage Detection](docs/engineering/09-automation-and-ai-detection.md)
- [Notifications](docs/engineering/10-notifications.md)
- [Database](db/README.md)

## Keywords

```text
wifi identity
guest wifi
captive portal
coworking wifi
hackathon wifi
event wifi
drop-in wifi
device ledger
bandwidth tracking
burst detection
automation detection
bot detection
AI agent tracking
agent identity
machine identity
progressive identity
Omada
UniFi
Yardi
OfficeRnD
Deskworks
Coworks
```
