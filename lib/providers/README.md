# Network Providers

Network providers turn WiFi controller data into normalized WhoFi observations.

Current providers:

- `demo`: converts local demo devices into normalized observations
- `omada`: read-only Essentials client-list scaffold plus snapshot normalizer
- `meraki`: Dashboard API read-only client-list scaffold plus snapshot normalizer

## Rules

- Keep credentials out of provider source files.
- Provider configs may reference environment variables, but must not contain secret values.
- Raw controller payloads can be stored for debugging after redaction.
- The UI should consume normalized observations, not vendor-specific payloads.
- Use generic provider contracts plus exact provider modules.
- Do not collapse Omada, UniFi, and Meraki into one fake-universal network module.

## Demo Endpoint

```text
GET /api/observations/demo
GET /api/devices?source=demo
```

Returns normalized observations generated from local demo data.

The device endpoint returns WhoFi device rows built from the selected source. It defaults to `source=demo`.

## Shape Endpoints

```text
GET /api/observations/meraki/shape
GET /api/observations/omada/shape
```

Returns one fake provider client payload normalized into a WhoFi observation.

## Live Test Endpoints

```text
GET /api/observations/meraki/test
GET /api/observations/omada/cli-doctor
GET /api/observations/omada/cli-test
GET /api/observations/omada/compare
GET /api/observations/omada/test
```

Uses server-side `MERAKI_API_KEY` and `MERAKI_NETWORK_ID` to fetch recent clients from the Meraki Dashboard API. Returns `409` when required env vars are missing. Never expose the API key in responses or logs.

The Omada test endpoint uses server-side Omada credentials and Essentials controller metadata to fetch current active clients. It returns `409` when required env vars are missing. Never expose Omada credentials, session tokens, cookies, or raw HAR headers in responses or logs.

The Omada CLI test endpoint runs an optional Printing Press generated CLI when `OMADA_PP_CLI_PATH` is configured. It is for private deployment smoke tests and connector comparison. The generated CLI is not vendored into the public WhoFi repo.

The Omada CLI doctor endpoint runs the optional Printing Press CLI `whofi doctor --live` command. It returns readiness checks only, never observations, MACs, IPs, names, or raw controller payloads.

The Omada compare endpoint calls both the TypeScript connector and the optional Printing Press CLI bridge, then returns counts and match status only. It intentionally does not return observations, MACs, IPs, names, or raw controller payloads.

## Device Snapshot Endpoint

```text
GET /api/devices?source=demo
GET /api/devices?source=omada
GET /api/devices?source=omada-pp
GET /api/sessions?source=demo
GET /api/sessions?source=omada
GET /api/sessions?source=omada-pp
```

Returns WhoFi `Device` rows from a selected observation source:

- `demo`: public-safe fixture devices
- `omada`: TypeScript Omada connector
- `omada-pp`: optional Printing Press CLI bridge

The dashboard source switcher uses this endpoint to keep demo mode as the default while allowing an operator to explicitly load configured Omada or Omada Printing Press live snapshots.

Live network sources are disabled unless `WHOFI_ENABLE_LIVE_DEVICE_SOURCES=true`. Demo mode remains available without that flag. The dashboard source switcher reads provider status and disables live source buttons while the gate is off.

If `WHOFI_LIVE_DEVICE_SOURCE_TOKEN` is set, live source requests must include the same value in `X-WhoFi-Live-Source-Token`. The dashboard has a local password field for this token and sends it only when loading live sources.

Set `WHOFI_VERIFICATION_CLIENT_MAC` and optional `WHOFI_VERIFICATION_CLIENT_LABEL` when an operator wants a known client as a smoke-test anchor. `WHOFI_VERIFICATION_ANCHOR_KIND=client` checks the observed client MAC; `WHOFI_VERIFICATION_ANCHOR_KIND=access_point` checks the AP/BSSID MAC reported with active client rows. The API only reports whether that anchor is configured and present; it does not echo the configured MAC address.

This endpoint is the public API boundary the dashboard should use before real database persistence exists. Live sources return MAC/IP/host fields from the configured controller, so production deployments should protect this endpoint behind normal app authentication before exposing real tenant networks.

`/api/sessions` uses the same source, live-gate, and token rules as `/api/devices`, then returns aggregate usage rollups by location, SSID, and AP.
