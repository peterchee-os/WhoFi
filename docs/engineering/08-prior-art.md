# Prior Art And Competitive Open Source

Date: 2026-08-23

## Summary

WhoFi is not unique because captive portals and guest WiFi email-capture tools already exist.

WhoFi should also not overclaim against commercial guest WiFi platforms. Products such as Purple sell access/onboarding, captive portal, tiered access, member-system integrations, and passwordless returning-member authentication. WhoFi's MVP is not that category yet; it starts as a passive WiFi identity and device visibility ledger that can become passwordless-ready later.

WhoFi is potentially differentiated because it combines:

- WiFi/device observation
- progressive profiles
- guests, hackathons, events, drop-ins, customers, staff, and agent hosts
- bandwidth/session ledger
- provider connectors for coworking/property systems
- local/demo and production deployment modes
- optional passwordless onboarding, captive portal, and enforcement later

Most existing open-source projects solve one slice: captive portal page, gateway enforcement, UniFi email capture, OpenWrt hotspot, RADIUS admin, or enterprise NAC.

## Closest Small Repos

### `jamerk/Captive-Portal-Email`

URL: https://github.com/jamerk/Captive-Portal-Email

Captive portal requiring a valid email address for login. Designed for Ubiquiti and Ruckus guest networks.

Overlap:

- guest email capture
- captive portal login
- UniFi/Ruckus angle

Difference:

- not a progressive identity/device/bandwidth ledger
- not coworking/home/event generalized

### `SEary342/unifi-guest-portal`

URL: https://github.com/SEary342/unifi-guest-portal

UniFi guest portal that captures names and emails before granting access.

Overlap:

- guest capture
- UniFi authorization

Difference:

- UniFi-specific
- no provider-neutral identity connectors
- no progressive profile/data ledger emphasis

### `KodyPrograms/Unifi-Email-Capture-On-Guest`

URL: https://github.com/KodyPrograms/Unifi-Email-Capture-On-Guest

Multi-location guest WiFi captive portal capturing name/email and authorizing guests via UniFi Controller API; logs submissions to CSV.

Overlap:

- name/email capture
- multi-location
- UniFi authorization

Difference:

- lightweight demo/tool
- CSV log focus
- no broader identity ledger

### `Joys-Advisory-Partners-Unifi/unifi-guest-portal`

URL: https://github.com/Joys-Advisory-Partners-Unifi/unifi-guest-portal

UniFi guest portal with Authentik OIDC authentication.

Overlap:

- guest portal
- identity-provider login

Difference:

- UniFi/AuthentiK-focused
- no progressive owner/context model spanning members, guests, events, homes, and companies

### `trinityvoxel/cohostr-wifi-portal`

URL: https://github.com/trinityvoxel/cohostr-wifi-portal

CohoSTR guest WiFi captive portal as a Home Assistant add-on.

Overlap:

- home/short-term-rental guest WiFi angle
- capture/portal style use case

Difference:

- no evidence yet of broader provider-neutral device/profile ledger

### `user2684/otpspot`

URL: https://github.com/user2684/otpspot

Wireless hotspot with OTP captive portal, described as allowing guests to register before accessing home WiFi.

Overlap:

- home guest WiFi
- OTP access

Difference:

- access/OTP-focused
- not a multi-provider identity and bandwidth ledger

## Mature Building Blocks

### OpenWISP

URLs:

- https://github.com/openwisp/openwisp-radius
- https://github.com/openwisp/openwisp-wifi-login-pages
- https://openwisp.io/docs/24.11/tutorials/hotspot.html

OpenWISP has serious captive portal/RADIUS/user-management pieces.

Overlap:

- captive portal
- login pages
- RADIUS
- user registration
- hotspot management

Difference:

- more network/RADIUS platform than coworking/device identity ledger
- heavier than the desired WhoFi MVP

### Nodogsplash

URL: https://github.com/nodogsplash/nodogsplash

Simple captive portal for restricted internet access.

Overlap:

- captive portal/gateway enforcement

Difference:

- network gateway layer, not identity ledger

### openNDS

URL: https://github.com/openNDS/openNDS

Small-footprint captive portal / network demarcation service.

Overlap:

- captive portal
- gateway layer

Difference:

- not a progressive profile/provider connector product

### CoovaChilli

URL: https://github.com/coova/coova-chilli

Open-source access controller for captive portal hotspots.

Overlap:

- hotspot access control
- RADIUS/gateway patterns

Difference:

- infrastructure building block
- not an operator-facing identity ledger

### WiFiDog

URLs:

- https://github.com/wifidog/wifidog-gateway
- https://github.com/wifidog/wifidog-auth

Classic open-source captive portal gateway/auth server.

Overlap:

- captive portal auth
- hotspot user/account patterns

Difference:

- older/gateway-focused
- not the same product shape

## Read

There is plenty of open-source prior art for:

- captive portals
- guest email capture
- hotspot auth
- OpenWrt/Raspberry Pi gateways
- UniFi-specific guest portals
- RADIUS/admin platforms

I have not found a mature open-source repo that combines:

```text
guest, member, staff, company, home visitor, event, and hackathon profiles
+ hackathon attendee/team context
+ WiFi client/bandwidth ledger
+ progressive identity
+ coworking/property system connectors
+ provider-neutral network adapters
+ agent host tracking
```

So the opportunity is not "invent captive portals." The opportunity is packaging the right combination for operators who need to understand devices, owners, guest/member context, event context, and bandwidth with a lighter, clearer product than enterprise NAC.

## Commercial Reference: Purple

URL: https://www.purple.ai/en-us/industries/coworking-spaces

Purple's coworking-space positioning is access/onboarding led: branded captive portal, CRM/member-system integrations, tiered access by plan, WPA2-Enterprise for staff, Passpoint/profile authentication for higher tiers, and passwordless returning-member authentication.

Overlap:

- coworking WiFi
- member/visitor context
- analytics and integrations
- optional access tiers

Difference:

- Purple starts at guest WiFi access and marketing/analytics.
- WhoFi MVP starts at passive identity, device visibility, bandwidth/session ledger, and progressive profile review.
- WhoFi should not call itself passwordless until it can provision or authorize access through captive portal, Passpoint, iPSK, RADIUS/EAP-TLS, or equivalent controller workflows.
