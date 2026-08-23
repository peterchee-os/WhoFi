# Network Providers

Network providers turn WiFi controller data into normalized WhoFi observations.

Current providers:

- `demo`: converts local demo devices into normalized observations
- `omada`: normalizer types and snapshot conversion only; no real controller login yet

## Rules

- Keep credentials out of provider source files.
- Provider configs may reference environment variables, but must not contain secret values.
- Raw controller payloads can be stored for debugging after redaction.
- The UI should consume normalized observations, not vendor-specific payloads.

## Demo Endpoint

```text
GET /api/observations/demo
```

Returns normalized observations generated from local demo data.

