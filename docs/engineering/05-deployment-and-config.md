# Deployment And Config

Date: 2026-08-23

## Decision

WhoFi supports local/demo mode, but it is architected as a hosted/self-hosted operational app.

## Local / Demo Mode

Purpose:

- development
- GWA/conference demos
- trying the product without external services
- very small operator evaluation

Expected flow:

```text
docker compose up
-> localhost dashboard
-> demo provider data
-> fake devices, guests, companies, events, and alerts
```

Local demo must not require real Omada, Yardi, or coworking-system credentials.

## Production Mode

Purpose:

- scheduled polling
- historical storage
- alerts
- optional captive portal
- multi-location operations

Components:

```text
web app
+ API
+ worker/scheduler
+ database
+ provider connectors
+ alert delivery
+ optional collector
```

Production can be deployed to:

- small VPS
- Fly.io
- Render
- Railway
- container host
- private server

## Collector Mode

Use when a WiFi controller is only reachable from inside the coworking LAN.

```text
WhoFi Collector
  -> talks to local controller
  -> normalizes observations
  -> pushes observations to hosted WhoFi API
```

This avoids exposing local controllers publicly.

## Config Model

Use environment variables plus a YAML/JSON config file.

Example:

```yaml
app:
  public_url: "https://wifi.example-coworking.com"
  operator_name: "Example Coworking"

network_providers:
  - id: "omada-main"
    type: "omada"
    display_name: "Main Omada"
    config:
      service_tier: "${OMADA_SERVICE_TIER:-essentials}"
      api_base_url: "${OMADA_API_BASE_URL}"
      cloud_portal_url: "${OMADA_CLOUD_PORTAL_URL}"
      controller_id: "${OMADA_CONTROLLER_ID}"
      site_id: "${OMADA_SITE_ID}"
      site_name: "${OMADA_SITE_NAME}"
      username: "${OMADA_USERNAME}"
      password: "${OMADA_PASSWORD}"
  - id: "meraki-redmond"
    type: "meraki"
    display_name: "Redmond Meraki"
    config:
      organization_id: "${MERAKI_ORGANIZATION_ID}"
      network_id: "${MERAKI_NETWORK_ID}"
      api_key: "${MERAKI_API_KEY}"
      base_url: "${MERAKI_API_BASE_URL}"

identity_providers:
  - id: "yardi"
    type: "yardi_kube"
    display_name: "Yardi Kube"
    config:
      base_url: "${YARDI_KUBE_BASE_URL}"
      api_key: "${YARDI_KUBE_API_KEY}"
  - id: "officernd"
    type: "officernd"
    display_name: "OfficeRnD"
    config:
      org: "${OFFICERND_ORG}"
      client_id: "${OFFICERND_CLIENT_ID}"
      client_secret: "${OFFICERND_CLIENT_SECRET}"
      webhook_signing_secret: "${OFFICERND_WEBHOOK_SIGNING_SECRET}"

locations:
  - id: "main"
    name: "Main Location"
    network_site_ref: "omada:site-id"
    external_property_ref: "yardi:property-id"

profile_policy:
  unknown_retention_days: 90
  event_guest_retention_days: 90
  drop_in_retention_days: 365
  max_guest_devices: 2

automation_policy:
  label_unknown_ai: false
  require_identity_evidence_for_known_agent: true
  enable_dns_signals: false
  enable_flow_signals: false
  enable_radius_identity: false

agent_identity:
  heartbeat_enabled: false
  certificate_identity_enabled: false
  default_label_without_evidence: "automation_like"

notifications:
  email_provider: "${NOTIFICATION_EMAIL_PROVIDER:-console}"
  from_email: "${NOTIFICATION_FROM_EMAIL}"
  from_name: "${NOTIFICATION_FROM_NAME:-WhoFi}"
  reply_to_email: "${NOTIFICATION_REPLY_TO_EMAIL}"
  batch_settling_minutes: 30
  operator_digest_recipients:
    - "ops@example-coworking.test"
```

## Integration Config Strategy

WhoFi should use generic config loading but exact integration modules.

Good:

```text
config loader
  -> identity/officernd module
  -> identity/yardi module
  -> network/omada module
  -> network/meraki module
```

Avoid:

```text
one generic "coworking API" module with arbitrary fields
```

Each production integration should have:

- exact integration type
- exact config schema
- exact admin card
- exact test connection route
- config readiness endpoint that reports missing fields without exposing values
- exact sync/webhook handlers when needed
- normalized output into WhoFi profiles, entitlements, locations, and observations

Public repo examples can include fake values and `.env.example` entries. Real operator config belongs in private deployment config or deployment secret storage.

Current implementation state:

- `GET /api/providers/network/status` reports Omada and Cisco Meraki config readiness from server-side env vars.
- `GET /api/observations/omada/cli-doctor` runs the optional Omada Printing Press CLI readiness check and returns only check names/statuses.
- Omada should default to `OMADA_SERVICE_TIER=essentials`; Standard/licensed should be opt-in, not implied by the first setup path.
- Settings shows whether required env vars are present.
- The endpoint returns missing env var names only, never secret values.

## Public Repo Files

Required:

```text
.env.example
config.example.yaml
docs/
examples/
fixtures/anonymized/
SECURITY.md
```

Required `.gitignore` entries:

```text
.env
.env.*
!/.env.example
config/*.local.yaml
config/thinkspace*.yaml
secrets/
*.pem
*.key
*.p12
*.mobileconfig
```

## Thinkspace Deployment Pattern

Preferred:

```text
WhoFi public repo
  -> reusable core
  -> generic connectors
  -> demo fixtures

WhoFi Thinkspace private deployment
  -> pins WhoFi version
  -> real credentials
  -> real location mappings
  -> private operator data adapter if needed
  -> production schedules and alerts
```

Avoid long-lived private fork divergence unless there is no better option.
