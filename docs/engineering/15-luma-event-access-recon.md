# Luma And Event Access Recon

Date: 2026-08-23

## Question

Can WhoFi use Luma as an event-registration source for WiFi access and event check-in without paying for Luma Plus API access?

## Short Answer

Do not make Luma a required dependency for WhoFi event access.

Luma can be an optional upstream registration/marketing tool, but WhoFi should own the WiFi access and check-in layer:

```text
registration source
-> WhoFi attendee roster
-> WhoFi QR / magic link / email match
-> WhoFi check-in
-> WhoFi device/profile binding
-> WiFi authorization
-> attendance export
```

## Luma Findings

Luma has a public API, but Luma documents API access as a Luma Plus feature.

Luma Plus pricing observed during recon:

- monthly: $59/month
- annual: $52/month billed annually
- annualized monthly plan equivalent: $708/year

Relevant Luma docs:

- Luma API getting started: https://docs.luma.com/reference/getting-started-with-your-api
- Luma pricing: https://luma.com/pricing
- Luma Plus overview: https://help.luma.com/p/luma-plus
- External check-in integration: https://help.luma.com/p/external-check-in-integration
- Download guest CSV: https://help.luma.com/p/download-guest-csv
- Expanded guest table / CSV update: https://help.luma.com/p/expanded-guest-table
- Managing guest list: https://help.luma.com/p/managing-your-guest-list
- Check-in: https://help.luma.com/p/check-in

## QR And API Notes

Luma QR codes use a check-in URL shape like:

```text
https://luma.com/check-in/[event-id]?pk=[key]
```

Luma's external check-in docs describe resolving that QR key through:

```text
GET https://public-api.luma.com/v1/events/guests/get?event_id={event_id}&id={pk_value}
```

That is useful if the organizer has API access, but it should not be required for WhoFi.

## CSV And Upload Notes

Luma supports downloading a guest CSV.

Luma also documents bulk guest status changes by CSV/list of emails, but the status values are registration states such as:

```text
Going
Not Going
Pending
Waitlist
```

That is not the same as uploading event check-in timestamps. Luma check-in appears to be separate from registration status and tied to ticket check-in state.

Practical implication:

- WhoFi can import a Luma attendee CSV.
- WhoFi can export attendance/check-in results after the event.
- Do not rely on free Luma features to push WhoFi check-in timestamps back into Luma's native checked-in state.
- If a customer insists Luma itself must show checked-in status, they probably need Luma's native scanner/manual workflow or paid API access.

## Printing Press Decision

Do not use Printing Press to reverse-engineer Luma's logged-in web app endpoints as a way around paid API access.

Reasons:

- fragile against UI/private endpoint changes
- likely terms-of-service risk
- poor reliability for live event check-in
- wrong failure mode when attendees are trying to join WiFi

Good Printing Press use:

- generate a CLI/MCP around WhoFi's own Event Access API
- generate safe import tooling for CSV schemas or customer-owned webhooks
- generate test clients for WhoFi event/check-in endpoints

Bad Printing Press use:

```text
capture Luma logged-in traffic
-> generate hidden Luma client
-> depend on it for production check-in
```

## Product Direction

Build a standalone WhoFi add-on:

```text
WhoFi Event Access
```

Responsibilities:

- events
- attendee rosters
- attendee import
- signed QR/check-in tokens
- self check-in
- staff scanner/check-in UI
- event attendance state
- device/profile binding
- WiFi authorization bridge
- attendance export

Adapters:

- CSV import
- Luma CSV import
- AI Tinkerers webhook/import
- Eventbrite CSV/import later
- native WhoFi registration later

Network enforcement adapters remain separate:

- Omada
- Meraki
- UniFi
- RADIUS/iPSK/Passpoint later

## Recommended MVP Flow

```text
Before event:
organizer exports attendee CSV from Luma or another system
-> imports into WhoFi
-> WhoFi creates attendee roster and signed tokens

At event:
attendee joins event SSID
-> captive portal opens WhoFi
-> attendee enters email or scans WhoFi QR
-> WhoFi matches attendee roster
-> WhoFi marks attendee checked in
-> WhoFi binds current device to attendee profile
-> WhoFi authorizes WiFi through provider adapter

After event:
WhoFi exports attendance CSV/PDF
-> email/name/check-in time/device/WiFi authorization evidence
```

## Positioning

This is stronger than a basic guest WiFi email capture product.

WhoFi's differentiated claim:

```text
registered attendee = checked-in person = authorized WiFi identity
```

Luma can remain an optional upstream event page, but WhoFi should own the access moment.

