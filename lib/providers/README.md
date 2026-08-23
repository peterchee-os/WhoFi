# Network Providers

Network providers turn WiFi controller data into normalized WhoFi observations.

Current providers:

- `demo`: converts local demo devices into normalized observations
- `omada`: normalizer types and snapshot conversion only; no real controller login yet
- `meraki`: normalizer types and snapshot conversion only; no real Dashboard API login yet

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
```

Returns normalized observations generated from local demo data.

## Shape Endpoints

```text
GET /api/observations/meraki/shape
```

Returns one fake Cisco Meraki client payload normalized into a WhoFi observation.
