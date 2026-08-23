# Provider Connectors

Date: 2026-08-23

## Principle

WhoFi core should be provider-neutral. Omada and Yardi are initial connectors, not hardcoded assumptions.

Provider-neutral does not mean one vague generic integration. The durable shape is:

```text
generic connector contracts
+ exact vendor modules
+ normalized output types
```

Each serious provider should have its own module because auth, webhooks, pagination, rate limits, object names, test-connection behavior, and failure modes differ by vendor.

Recommended layout:

```text
lib/integrations/
  network/
    types.ts
    demo/
    omada/
    unifi/
    meraki/
  identity/
    types.ts
    csv/
    yardi/
    officernd/
    deskworks/
    coworks/
    nexudus/
```

The generic contract defines what WhoFi needs. The exact modules handle vendor reality.

## Integration Module Pattern

Each exact integration module should own:

- provider config schema
- auth/client setup
- API calls
- pagination and rate-limit behavior
- normalized output mapping
- test connection
- last test result/status
- webhook endpoint metadata, when supported
- redacted diagnostics
- provider-specific error normalization

Admin UI should follow the same pattern for each production integration:

- collapsed card by default
- enable/disable toggle
- config form
- masked secret inputs
- save action
- test connection action
- last tested timestamp
- last test result and redacted error
- read-only webhook URL/copy action, when relevant

Secrets must be write-only from the UI. The UI may show `saved`, `missing`, or last-four metadata, but never secret values.

Use integration type names with a category/provider convention:

```text
network_omada
network_unifi
network_meraki
identity_csv
property_management_yardi
property_management_officernd
property_management_deskworks
property_management_coworks
property_management_nexudus
```

## Network Provider Interface

Purpose:

Read client/session/bandwidth data and optionally authorize or block devices.

```ts
interface NetworkProvider {
  listSites(): Promise<NetworkSite[]>
  listAccessPoints(siteId: string): Promise<AccessPoint[]>
  listClients(siteId: string): Promise<NetworkClient[]>
  getClientUsage(input: UsageQuery): Promise<ClientUsage[]>
  listAuthEvents?(input: AuthEventQuery): Promise<NetworkAuthEvent[]>
  authorizeClient?(input: AuthorizeClientInput): Promise<AuthorizeClientResult>
  blockClient?(input: BlockClientInput): Promise<BlockClientResult>
}
```

Initial provider:

- Omada
- Cisco Meraki for Redmond

Future providers:

- UniFi
- Aruba/Ruckus via API or CSV
- generic CSV
- demo provider

## Identity Provider Interface

Purpose:

Resolve companies, people, memberships, contracts, passes, and events from coworking/property/customer systems.

```ts
interface IdentityProvider {
  listCompanies(input: SyncWindow): Promise<ExternalCompany[]>
  listPeople(input: SyncWindow): Promise<ExternalPerson[]>
  listMemberships?(input: SyncWindow): Promise<ExternalMembership[]>
  listContracts?(input: SyncWindow): Promise<ExternalContract[]>
  listEvents?(input: SyncWindow): Promise<ExternalEvent[]>
  getPersonByEmail?(email: string): Promise<ExternalPerson | null>
  subscribeWebhooks?(input: WebhookConfig): Promise<WebhookSubscription[]>
}
```

Initial provider:

- Yardi Kube

Conference-relevant providers:

- Deskworks
- OfficeRnD
- Coworks
- Nexudus
- Cobot
- Spacebring
- CSV/manual import

## Omada Connector

Responsibilities:

- list sites
- list access points
- list current clients
- collect MAC, IP, hostname, SSID, AP, site, traffic counters, first/last seen when available
- collect authentication/accounting events later if Omada/RADIUS configuration exposes them
- optionally authorize captive portal clients
- optionally block/quarantine clients later

### Service Tier Decision

Use the existing **Essentials / Free** Omada organization first.

Omada's organization add flow exposes two paths:

- **Essentials / Free**: includes Omada Network management, site map, quick VLAN configuration, and enough dashboard/client telemetry for WhoFi's first read-only device ledger.
- **Standard / Licensed**: adds SSO login, richer security features, richer captive portal types, WLAN optimization, backup/restore/site migration, maps, and reports.

WhoFi should start on Essentials because the first product goal is visibility:

```text
current clients
-> MAC/IP/name/SSID/AP/site
-> traffic counters
-> unknown/known owner resolution
-> review and alert workflow
```

Do not require a Standard licensed Omada org for MVP. Treat Standard as a later option if an operator needs richer captive portals, licensed reporting, or security controls that Essentials does not expose.

Open spike questions:

- exact best API endpoint for current clients
- whether counters are cumulative or per-session
- whether cloud and hardware controller APIs differ enough to require subtypes
- how to handle rate limits and sessions

Current browser recon notes:

- Shared Chrome has an authenticated Omada Cloud tab for the Thinkspace organization.
- The visible console is the Omada Cloud Management Platform in the US East region.
- The active UI is the Essential Controller experience.
- The org manager showed Thinkspace as `Essentials`; the Add Organization modal showed `Essentials / Free` and `Standard / Licensed`.
- We did not create a new Omada organization. WhoFi should connect to the existing Thinkspace Essentials org first.
- The selected site in the UI was Seattle during recon.
- Client table columns visible in the UI: client name, IP address, authentication type, status, SSID, network, AP/port, download traffic, uptime, and actions.
- The Essential Controller API host discovered from browser storage was `https://use1-api-omada-essential-controller.tplinkcloud.com`.
- The console uses a controller/org path segment before `/api/v2`.
- Browser resource traces confirmed API paths such as `/api/v2/sites/{siteId}/site/workspace`, `/api/v2/sites/{siteId}/dashboard/activeSsids`, and OpenAPI dashboard routes such as `/openapi/v1/{controllerId}/sites/{siteId}/dashboard/active-clients`.
- Earlier bundle recon suggested a current clients path under `/{controllerId}/api/v2/sites/{siteId}/insight/clients`; keep this as a candidate until the live read-only connector confirms the exact best endpoint.
- Related actions exist for block/unblock/delete client and past connection/portal-auth history, but MVP should stay read-only.

Expected server-side config:

- `OMADA_SERVICE_TIER`: `essentials` for the free route; `standard` only when intentionally using a licensed org.
- `OMADA_API_BASE_URL`: Essential Controller API host, e.g. regional Omada Essential Controller API base URL.
- `OMADA_CONTROLLER_ID`: the Omada controller/org id path segment used before `/api/v2`.
- `OMADA_SITE_ID`: selected site id, such as Seattle or Redmond once mapped.
- `OMADA_SITE_NAME`: optional display name for operator clarity.
- `OMADA_USERNAME` and `OMADA_PASSWORD`: server-side credentials or secret references for the TP-Link/Omada account.

Credential note:

- Thinkspace has a 1Password item named `Omada TPLink Cloud WIFI SEA`.
- That item also stores WhoFi-specific Omada metadata for the Essentials/free route.
- Do not commit values from that item. Use it only for private deployment env injection or local spike work.

## Cisco Meraki Connector

Meraki should be an exact network module because Redmond uses Cisco Meraki gear.

Public Cisco Dashboard API notes:

- Meraki provides a Dashboard API for cloud-managed network monitoring and management.
- `GET /networks/{networkId}/clients` lists clients seen on a network for a timespan.
- The client list includes MAC, IP, description/user, SSID, status, recent connected device, and sent/received usage.
- Cisco documents that this client data is updated at most once every five minutes.

Responsibilities:

- authenticate using an operator-scoped Meraki Dashboard API key or OAuth/bearer credential
- list organizations and networks during setup
- list clients for the selected Redmond/network scope
- collect MAC, IP, SSID, recent device/AP, online/offline status, and usage counters
- normalize usage into WhoFi `rxBytes` and `txBytes`
- keep API keys write-only in the admin UI
- handle pagination from Meraki response link headers

Expected admin configuration:

- organization id
- network id
- API key or bearer credential, write-only
- enable/disable toggle
- test connection
- last test result/error/timestamp

Current implementation state:

- exact normalizer module exists at `lib/providers/meraki.ts`
- demo-safe shape endpoint exists at `/api/observations/meraki/shape`
- server-side live test endpoint exists at `/api/observations/meraki/test`
- Settings integration card can test the normalized output shape
- live test route is not exposed in the UI until provider config exists for both Omada and Meraki
- live Meraki API client scaffolding exists for read-only client observations
- no production sync scheduler yet

## Yardi Kube Connector

Responsibilities:

- authenticate without exposing keys
- list companies
- list members/people
- list contracts where useful
- list properties/locations
- support modified-since sync where possible
- support webhooks where practical

Useful concepts:

- company id/name/status
- member id/name/email/company/property/status
- contract company/property/move-in/move-out/termination evidence
- property/location mapping

## OfficeRnD Connector

Responsibilities:

- authenticate using operator-scoped client credentials
- store only redacted credential metadata in app-readable config
- test connection without requiring a full sync
- list companies/accounts
- list members/people
- list memberships/plans/contracts when available
- map OfficeRnD locations/floors/resources to WhoFi locations where useful
- support webhook configuration and signing-secret status when available

Expected admin configuration:

- organization/subdomain
- client id
- client secret
- optional webhook signing secret
- enable/disable toggle
- test connection
- last test result/error/timestamp

OfficeRnD should be an exact integration module, not a generic coworking-system config blob.

## Deskworks Connector

Deskworks should be an exact module.

Public recon notes:

- Deskworks publishes integration categories for bookings, door access, mail, payments, printing, WiFi network, and automation.
- Deskworks specifically describes WiFi network integrations that can log member check-ins through network activity.
- Deskworks reporting pages describe member, occupancy, utilization, check-in, day-pass, plan, and revenue reporting.
- Public pages mention an open API, but a complete endpoint reference was not found during initial recon.

Responsibilities:

- authenticate using operator-scoped API credentials when available
- list members/people
- list companies/accounts
- list plans/memberships or usage allowances when available
- list locations/resources where useful
- ingest check-ins or usage records if exposed
- map WiFi/network check-in concepts into WhoFi identity evidence
- support CSV/manual fallback if API access requires vendor enablement

Expected admin configuration:

- API base URL or tenant/org identifier, if applicable
- API key/client credentials, write-only
- enable/disable toggle
- test connection
- last test result/error/timestamp

Deskworks is especially interesting for WhoFi because its product language already connects WiFi activity, check-ins, usage tracking, and billing.

Current implementation state:

- exact normalizer module exists at `lib/integrations/identity/deskworks`
- demo-safe shape endpoint exists at `/api/profiles/deskworks/shape`
- Settings integration card can test the normalized output shape
- no live Deskworks API client, credentials, or production sync yet

## Nexudus Connector

Nexudus should be an exact module.

Public recon notes:

- Nexudus has developer resources for REST API, Public API, Marketplaces API, Environment API, Access Control, Network Bridge, CLI, and SDK.
- Nexudus REST API is described as covering locations, customers, bookings, billing, and related resources.
- Nexudus add-ons use registered application credentials.
- For WiFi entitlement checks, an MVP can either sync members/customers periodically or make a real-time eligibility call during captive portal login.

Responsibilities:

- authenticate through a registered Nexudus app/add-on
- list customers/people
- list companies/teams where available
- list locations
- list plans/memberships/contracts
- list bookings if useful for event/day-pass entitlement
- support real-time member eligibility lookup by email or identifier
- optionally use Network Bridge or access-control concepts later if they help local-controller deployment

Expected admin configuration:

- app key/client id
- app secret/client secret, write-only
- account/location scope
- enable/disable toggle
- test connection
- last test result/error/timestamp

Nexudus is likely one of the cleaner exact modules because the public developer surface is broad and API-first.

Current implementation state:

- exact normalizer module exists at `lib/integrations/identity/nexudus`
- demo-safe shape endpoint exists at `/api/profiles/nexudus/shape`
- Settings integration card can test the normalized output shape
- no live Nexudus API client, credentials, or production sync yet

## Coworks Connector

Coworks should follow the same exact-module pattern as OfficeRnD, Yardi, Deskworks, and Nexudus:

- named module per vendor
- provider-specific config fields
- provider-specific API client
- provider-specific test connection
- shared normalized output types

The shared output is generic; the module implementation is not.

## CSV / Manual Provider

Required for MVP and demos.

Responsibilities:

- import companies
- import people
- import event attendee rosters
- import hackathon attendee rosters
- import hackathon teams/projects
- import device assignments

This is important because many coworking operators and hackathon organizers will not have a clean API on day one.

Current implementation state:

- exact normalizer module exists at `lib/integrations/identity/csv`
- demo-safe shape endpoint exists at `/api/profiles/csv/shape`
- preview endpoint exists at `/api/profiles/csv/preview`
- Settings integration card can test normalized output from a fake CSV roster
- parser supports comma-delimited and tab-delimited input with quoted fields
- no production upload UI or persisted import job yet

## Demo Provider

Required for GWA and local quickstart.

Should provide fake:

- network sites
- access points
- client observations
- guests
- hackathon attendees
- hackathon teams
- event organizers
- companies
- staff devices
- agent hosts
- bandwidth patterns
- alerts

## RADIUS / Certificate Identity Provider

Optional future connector for stronger known-agent identity. This is not required for the coworking/hackathon MVP, but the interface should leave room for it.

Responsibilities:

- ingest authentication success/failure events
- normalize RADIUS usernames or machine identities
- store certificate fingerprint metadata when configured
- map agent/staff/machine identities to devices and profiles
- support revocation/quarantine events where the network provider allows it

This connector should strengthen `known_agent` evidence. It should not be required for ordinary guest WiFi, event WiFi, or passive Omada visibility.

## Connector Output Types

Provider output should normalize into generic shapes:

- `ExternalCompany`
- `ExternalPerson`
- `ExternalMembership`
- `ExternalContract`
- `ExternalEvent`
- `NetworkSite`
- `AccessPoint`
- `NetworkClient`
- `ClientUsage`

Every external record should include:

- provider id
- stable external id
- display name
- status
- raw payload
- last modified if available
