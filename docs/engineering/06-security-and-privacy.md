# Security And Privacy

Date: 2026-08-23

## Public Repo Safety

Never commit:

- API keys
- OAuth client secrets
- Omada credentials
- Yardi credentials
- real MAC addresses
- real customer/member/person data
- real internal IP addresses
- production database URLs
- private deployment config
- Resend API keys

Use fake examples:

- `00:11:22:33:44:55`
- `alex@example-coworking.test`
- `Example Startup LLC`
- `192.0.2.10`
- `external-company-123`
- `network-site-demo`

## Data Collection Boundary

Collect:

- MAC
- IP
- hostname
- AP / SSID / site / location
- connection windows
- bandwidth totals
- owner/profile binding
- staff review events
- agent host heartbeat when configured
- optional certificate/RADIUS identity metadata when configured

Do not collect by default:

- packet contents
- browsing history
- DNS logs tied to individuals
- screenshots
- application/process details from personal devices

For operator-owned agent hosts, richer heartbeat metadata is acceptable when explicitly configured.

For personal devices, do not infer application/process identity. A laptop with traffic bursts is not automatically an AI agent; it is an automation-like usage signal until linked to explicit evidence.

Email notifications should avoid raw MAC addresses in subject lines and should not send guest/customer emails until templates, consent, and recipient rules are explicit.

Live device sources must be explicitly enabled with `WHOFI_ENABLE_LIVE_DEVICE_SOURCES=true`. Keep that flag false for public demos and any deployment that does not yet have admin authentication or equivalent operator access control.

## Secret Handling

Config files may reference environment variable names. They must not contain secret values.

Good:

```yaml
api_key: "${YARDI_KUBE_API_KEY}"
password: "${OMADA_PASSWORD}"
```

Bad:

```yaml
api_key: "real-key"
password: "real-password"
```

## Auth Model

MVP can use simple admin authentication.

Longer-term roles:

- owner/admin
- operator/staff
- event host
- read-only
- service/collector

Service/collector tokens should be scoped and revocable.

## Privacy Defaults

Suggested retention:

- raw observations: 90 days
- session rollups: 1 year
- unknown device profiles: 30-90 days after last seen
- event guest profiles: 90 days after event unless converted
- drop-in profiles: 1 year after last visit
- customer/staff/agent profiles: follow operator account lifecycle

Retention must be configurable.

## Threats To Consider

- leaked provider credentials
- public repo accidentally containing real data
- captive portal phishing risk
- forged collector submissions
- MAC spoofing
- private MAC randomization causing duplicate profiles
- over-merging guest/customer identities
- rogue high-bandwidth device
- revoked customer still online
- unknown automation/agent host
- overclaiming "AI detection" from weak network signals

## Guardrails

- store raw provider payloads but redact before sharing
- mark confidence on every device/profile owner binding
- require staff review for ambiguous merges
- keep audit history for profile/device owner changes
- allow revocation and expiration
- make demo fixtures obviously fake
- keep labels honest: `known_agent` requires identity evidence, while `automation_like` requires only behavioral evidence
- keep notification providers server-side; `RESEND_API_KEY` must never reach the browser
