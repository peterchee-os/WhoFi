# Provider Connectors

Date: 2026-08-23

## Principle

WhoFi core should be provider-neutral. Omada and Yardi are initial connectors, not hardcoded assumptions.

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

Future providers:

- UniFi
- Cisco Meraki
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

Open spike questions:

- exact best API endpoint for current clients
- whether counters are cumulative or per-session
- whether cloud and hardware controller APIs differ enough to require subtypes
- how to handle rate limits and sessions

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
