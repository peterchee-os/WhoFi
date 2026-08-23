# Omada Printing Press Architecture

Date: 2026-08-23

## Purpose

This document defines how a Printing Press generated Omada CLI should fit into WhoFi without making WhoFi depend on private Omada captures or operator-specific credentials.

## Architecture Decision

WhoFi should keep the in-app Omada provider contract, but allow an Omada Printing Press CLI to become the read-only collection engine once it is stable.

```text
WhoFi app
  -> network provider contract
  -> Omada provider adapter
  -> one of:
       TypeScript Omada client
       generated/patched Omada PP CLI
  -> normalized network observations
  -> device ledger
```

The contract stays the same regardless of implementation:

```ts
listSites()
listAccessPoints(siteId)
listClients(siteId)
listUsage(query)
```

The Printing Press CLI is an implementation detail, not the product boundary.

## Why This Split Matters

WhoFi is open-source and provider-neutral. The public repo should not depend on:

- private HAR files
- real controller IDs
- real site IDs
- customer MAC/IP/name samples
- 1Password item names
- organization-specific Omada assumptions

The public WhoFi repo may include:

- a generic Omada provider contract
- a demo Omada shape
- public-safe docs about the expected request convention
- config keys with empty/example values
- instructions for operators to run their own private sniff/spike

Private deployments may include:

- real Omada config
- real service credentials
- private focused Printing Press specs
- patched generated CLI builds
- smoke-test scripts against real controllers

## Runtime Options

### Option A: TypeScript Connector

WhoFi calls Omada directly from the Next.js/backend runtime.

```text
WhoFi worker
  -> login Omada
  -> fetch init-info
  -> fetch clients
  -> normalize
  -> persist
```

Pros:

- fewer moving parts
- easy to deploy with the app
- already proven for current active clients

Cons:

- WhoFi owns all Omada request quirks
- less useful as a standalone diagnostic tool
- harder to test independently from the app runtime

### Option B: Printing Press CLI As Collector

WhoFi invokes a local or containerized `omada-essential-pp-cli` collector.

```text
WhoFi worker
  -> omada-essential-pp-cli whofi observations --json
  -> normalize or pass through normalized output
  -> persist
```

Pros:

- better operator/debug surface
- agent-friendly CLI and MCP shape
- reusable outside WhoFi
- good place for connector-specific smoke tests

Cons:

- requires packaging and version management
- generated auth layer needs a hand patch
- WhoFi must handle CLI failures/timeouts carefully

Current public WhoFi support:

```text
GET /api/observations/omada/cli-test
  -> requires OMADA_PP_CLI_PATH
  -> runs: <path> whofi observations --json
  -> accepts either an array of observations or { observations: [...] }
  -> validates the normalized output shape
  -> redacts common secret-like, MAC, and IP strings from errors
```

The route exists as a private-deployment smoke-test bridge. It should not appear as a normal UI live-test action until WhoFi has saved provider configuration and a clear operator permission model.

### Option C: Collector Sidecar

Run the printed CLI as part of a local collector inside the operator network.

```text
WhoFi hosted app
  <- signed observations from local collector
       -> omada-essential-pp-cli
       -> local Omada/cloud controller
```

Pros:

- good for local controllers or firewall-restricted sites
- avoids exposing controllers publicly
- can work for Omada, Meraki, UniFi, and others later

Cons:

- not needed for the first hosted/self-hosted MVP
- more deployment complexity

## Recommended Near-Term Path

Use Option A for the first production WhoFi Omada path because it is already working.

In parallel, evolve Option B as a private spike:

1. Keep a private focused Omada Printing Press spec.
2. Patch generated auth/session behavior.
3. Add a `whofi observations` command that emits normalized observations.
4. Use it as a connector test harness.
5. Only make it a runtime dependency after it is more boring than the TypeScript path.

Current status: the private spike has a hand-patched `whofi observations` command and has passed a private read-only live smoke test. The remaining architecture question is packaging, repeatable regeneration, and whether WhoFi should call the CLI or continue using the TypeScript connector.

## Required Omada Session Flow

The printed CLI must learn this flow:

```text
POST /{controllerId}/api/v2/login
  -> token
  -> session cookie if provided

GET /{controllerId}/api/v2/current/user/init-info
  -> userId when available

POST /openapi/v2/{controllerId}/sites/{siteId}/clients
  headers:
    Csrf-Token: <token>
    User-Id: <userId when available>
    X-Requested-With: XMLHttpRequest
    Omada-Request-Source: web-local
    no Authorization Bearer header
  body:
    filters.active = true
    sorts = {}
    hideHealthUnsupported = true
    page
    pageSize
    scope = 1
```

This is the behavior verified from the browser HAR and a private live read-only test.

## Public Config Shape

Public config keys:

```text
OMADA_SERVICE_TIER=essentials
OMADA_API_BASE_URL=
OMADA_CLOUD_PORTAL_URL=
OMADA_CONTROLLER_ID=
OMADA_SITE_ID=
OMADA_SITE_NAME=
OMADA_USERNAME=
OMADA_PASSWORD=
OMADA_PP_CLI_PATH=
OMADA_PP_CLI_TIMEOUT_MS=15000
```

The public repo can document names and purposes. Real values belong only in private deployment configuration or a secret manager.

## Output Contract

The Omada CLI emits WhoFi-ready observations:

```json
{
  "providerType": "omada",
  "providerId": "omada",
  "location": "site display name",
  "mac": "redacted-or-real-at-runtime",
  "ip": "redacted-or-real-at-runtime",
  "hostname": "device name",
  "ssid": "network name",
  "apMac": "redacted-or-real-at-runtime",
  "apName": "access point name",
  "rxBytes": 0,
  "txBytes": 0,
  "observedAt": "ISO-8601 timestamp",
  "eventType": "client_seen",
  "raw": {}
}
```

`mac` is the client/device MAC. `apMac` is the access point or BSSID MAC reported with the client row. Keep them separate because operator-visible WiFi diagnostics often show the AP/BSSID a workstation is connected to, not the workstation's own client MAC.

The CLI may also expose raw controller output for diagnostics, but WhoFi should consume normalized output by default. The private spike now omits raw payloads by default and requires an explicit raw-output flag for diagnostics. Any raw output mode should be opt-in and should not be used in public fixtures or docs.

## Safety Rules

- Keep HAR files and generated samples out of the public repo.
- Never commit real MACs, IPs, controller IDs, site IDs, cookies, CSRF tokens, or user IDs.
- Do not publish the Omada CLI until auth/session behavior is stable and reviewed.
- Keep the first connector read-only.
- Treat block/quarantine/captive-portal actions as later, explicit features.
