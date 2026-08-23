# WhoFi Engineering Overview

Date: 2026-08-23

## Working Definition

WhoFi is a coworking, hackathon, event, and guest WiFi identity ledger.

It connects network observations from WiFi controllers to progressive profiles for people, guests, hackathon attendees, event teams, companies, staff devices, and agent hosts.

## Design Shape

```text
Network provider
  -> collector
  -> observation events
  -> sessions
  -> devices
  -> profiles
  -> identity/provider links
  -> alerts and dashboards

Identity provider
  -> companies/accounts
  -> people/members
  -> contracts/passes/events
  -> active/inactive status
```

## Current Decisions

- WhoFi is open-source first.
- Localhost/demo mode is required, but the production architecture is hosted/self-hosted.
- Thinkspace or any other operator should use private deployment config rather than forking and hardcoding credentials.
- Yardi is one identity provider, not the whole identity universe.
- Guests, hackathon attendees, event visitors, drop-ins, vendors, staff devices, and AI/automation hosts are first-class.
- Hackathon and event WiFi are core use cases, not side examples.
- Known AI/automation hosts require declared identity evidence such as registration, heartbeat, certificate, staff assignment, or endpoint signal.
- Traffic bursts and unusual usage are automation-like signals, not proof of AI by themselves.
- Enforcement is optional and later. Start with visibility.

## Docs

1. [Product Principles](01-product-principles.md)
2. [System Architecture](02-system-architecture.md)
3. [Data Model](03-data-model.md)
4. [Provider Connectors](04-provider-connectors.md)
5. [Deployment And Config](05-deployment-and-config.md)
6. [Security And Privacy](06-security-and-privacy.md)
7. [MVP Roadmap](07-mvp-roadmap.md)
8. [Prior Art And Competitive Open Source](08-prior-art.md)
9. [Automation And AI-Like Usage Detection](09-automation-and-ai-detection.md)
10. [Notifications](10-notifications.md)
11. [Current Handoff](11-current-handoff.md)

## Implementation Artifacts

- [Initial Postgres Migration](../../db/migrations/0001_initial.sql)
- [Database Notes](../../db/README.md)

## Non-Goals For MVP

- full NAC
- certificate onboarding
- packet inspection
- DNS/browsing history surveillance
- replacing the WiFi controller
- replacing coworking/property management platforms
- hardcoded operator-specific assumptions
