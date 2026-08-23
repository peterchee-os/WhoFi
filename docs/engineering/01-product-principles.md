# Product Principles

Date: 2026-08-23

## 1. Coworking-Sized, Not Enterprise NAC

WhoFi should solve the practical coworking question:

```text
Who or what is on our WiFi, where are they, and are they consuming unusual bandwidth?
```

This applies to coworking spaces, hackathons, meetups, workshops, demo days, and home/guest networks. It should not start as a full enterprise access-control platform.

## 2. Visibility Before Enforcement

The first useful version observes and explains:

- devices seen
- first/last seen
- location / AP / SSID
- bandwidth usage
- owner/profile when known
- unknown or suspicious devices

Blocking, quarantining, RADIUS, certificates, and captive portal enforcement can come later.

## 3. Progressive Identity

Not every WiFi user is a formal customer.

WhoFi supports profile growth:

```text
unknown device
-> lightweight guest/event/drop-in profile
-> verified email/phone/event registration
-> linked company/member/mailbox/agent
-> operational identity
```

This supports:

- hackathon attendees
- hackathon teams
- event guests
- event organizers
- meeting visitors
- day-pass/drop-in users
- prospective customers
- vendors
- contractors
- staff personal devices
- temporary AI/dev machines

## 4. Provider-Neutral Core

Omada and Yardi are important starting connectors, but they are not the product.

Core concepts should use generic names:

- network provider
- identity provider
- profile
- device
- session
- observation
- organization
- person
- event
- guest pass

## 5. Open-Source Safe

The public repo must not contain secrets or Thinkspace-specific data.

Examples and fixtures must be fake or anonymized.

## 6. Humans Can Resolve Ambiguity

WhoFi should suggest ownership, not pretend every identity match is certain.

Staff review is a core feature:

- assign owner
- merge profiles
- mark shared device
- expire guest
- revoke device
- ignore harmless noise

## 7. Agent Hosts Need Explicit Signals

The network can identify a device. It cannot reliably identify which AI agent or process is running on that device.

For AI/automation accountability, WhoFi should support:

- registered agent hosts
- agent identities
- optional heartbeat
- optional certificate or RADIUS identity later
- staff assignment for known internal machines
- bandwidth and location visibility
- alerts when agent hosts are unknown, missing, or behaving oddly

The useful model is identity-first:

```text
registered agent host
-> declared purpose/owner
-> optional heartbeat or certificate evidence
-> behavioral baseline
-> alert when behavior deviates
```

## 8. Detect Automation Honestly

WhoFi can detect automation-like behavior from usage patterns:

- traffic bursts
- sustained high bandwidth
- off-hours activity
- repeated reconnects
- high connection/DNS rates when optional integrations are enabled

It should not claim to detect "AI" from WiFi alone. Label devices as `automation_like` or `needs_review` unless there is stronger evidence from an agent heartbeat, endpoint signal, DNS/flow integration, or staff confirmation.

Known agent labels should come from explicit identity evidence. Automation labels should come from behavior.
