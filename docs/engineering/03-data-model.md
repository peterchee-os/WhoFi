# Data Model

Date: 2026-08-23

These are design sketches, not final migrations.

## Core Tables

### `network_provider`

Represents a configured WiFi/network source.

```sql
network_provider (
  id uuid primary key,
  type text not null,
  name text not null,
  config jsonb not null default '{}',
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Provider types:

- `omada`
- `unifi`
- `meraki`
- `csv`
- `demo`

### `location`

Physical coworking location.

```sql
location (
  id uuid primary key,
  name text not null,
  timezone text,
  address jsonb,
  external_refs jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### `network_site`

Maps provider site ids to WhoFi locations.

```sql
network_site (
  id uuid primary key,
  network_provider_id uuid not null,
  location_id uuid,
  external_site_id text not null,
  external_site_name text,
  is_active boolean not null default true,
  unique (network_provider_id, external_site_id)
)
```

### `device`

Canonical network device.

```sql
device (
  id uuid primary key,
  normalized_mac text not null unique,
  label text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  last_hostname text,
  last_ip inet,
  last_location_id uuid,
  status text not null default 'unknown',
  risk_state text not null default 'normal',
  private_mac_suspected boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Device statuses:

- `unknown`
- `claimed`
- `staff_assigned`
- `managed`
- `agent_host`
- `revoked`
- `ignored`

### `profile`

Progressive identity profile.

```sql
profile (
  id uuid primary key,
  profile_type text not null,
  display_name text,
  primary_email citext,
  primary_phone text,
  organization_name text,
  profile_level text not null default 'seen',
  source text not null,
  status text not null default 'active',
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Profile types:

- `unknown`
- `guest`
- `event_attendee`
- `drop_in`
- `customer`
- `staff`
- `vendor`
- `agent`
- `machine`
- `shared_device`

Profile levels:

- `seen`
- `claimed`
- `verified`
- `linked`
- `operational`

### `profile_identifier`

Identifiers that help link and merge profiles.

```sql
profile_identifier (
  id uuid primary key,
  profile_id uuid not null,
  identifier_type text not null,
  identifier_value text not null,
  normalized_value text not null,
  verification_status text not null default 'unverified',
  source text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (identifier_type, normalized_value)
)
```

Identifier types:

- `email`
- `phone`
- `mac`
- `event_registration_id`
- `pass_id`
- `external_person_id`
- `external_company_id`
- `agent_id`
- `agent_host_id`
- `certificate_fingerprint`

### `device_owner`

Current and historical owner bindings.

```sql
device_owner (
  id uuid primary key,
  device_id uuid not null,
  profile_id uuid,
  owner_type text not null,
  confidence text not null default 'manual',
  source text not null,
  status text not null default 'active',
  external_refs jsonb not null default '{}',
  claimed_by uuid,
  claimed_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Owner types:

- `human`
- `guest`
- `event_attendee`
- `drop_in`
- `company`
- `mailbox`
- `agent`
- `machine`
- `staff_device`
- `shared_device`

### `device_session`

Rollup of a connected interval.

```sql
device_session (
  id uuid primary key,
  device_id uuid not null,
  network_site_id uuid,
  location_id uuid,
  ssid text,
  ap_mac text,
  ap_name text,
  ip inet,
  hostname text,
  started_at timestamptz not null,
  ended_at timestamptz,
  last_seen_at timestamptz not null,
  rx_bytes bigint not null default 0,
  tx_bytes bigint not null default 0,
  provider_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### `observation_event`

Append-only raw network observation.

```sql
observation_event (
  id uuid primary key,
  network_provider_id uuid not null,
  device_id uuid,
  observed_at timestamptz not null,
  provider text not null,
  event_type text not null,
  client_mac text not null,
  ip inet,
  hostname text,
  ssid text,
  ap_mac text,
  site_id text,
  rx_bytes bigint,
  tx_bytes bigint,
  raw_payload jsonb,
  created_at timestamptz not null default now()
)
```

### `event`

Hackathon, meetup, workshop, or other temporary group context.

```sql
event (
  id uuid primary key,
  location_id uuid,
  name text not null,
  event_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  default_access_expires_at timestamptz,
  organizer_name text,
  organizer_email citext,
  expected_attendee_count integer,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Hackathon-friendly fields can live in `external_refs` or later extensions:

- registration platform id
- team id/name
- sponsor/company
- project name
- demo table/room
- organizer notes

### `guest_pass`

Time-limited access grant.

```sql
guest_pass (
  id uuid primary key,
  profile_id uuid,
  location_id uuid,
  event_id uuid,
  pass_type text not null,
  issued_by uuid,
  host_profile_id uuid,
  code text,
  status text not null default 'active',
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  max_devices integer default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### `alert`

Operational review queue.

```sql
alert (
  id uuid primary key,
  device_id uuid,
  profile_id uuid,
  location_id uuid,
  alert_type text not null,
  severity text not null default 'info',
  status text not null default 'open',
  title text not null,
  details jsonb not null default '{}',
  opened_at timestamptz not null default now(),
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz
)
```

Alert types:

- `unknown_device_persistent`
- `unknown_device_high_bandwidth`
- `automation_like_usage`
- `revoked_owner_online`
- `device_seen_wrong_location`
- `device_owner_conflict`
- `agent_host_unregistered`
- `agent_host_high_bandwidth`
- `agent_identity_registered`
- `agent_heartbeat_missing`
- `agent_certificate_changed`
- `agent_new_network_segment`
- `mac_randomization_suspected`

## Automation / Usage Tables

Detailed design:

- [Automation And AI-Like Usage Detection](09-automation-and-ai-detection.md)

## Merge Rules

Safe automatic links:

- same verified email
- same authenticated app user
- same external member/person id
- same agent id

Require review:

- same display name
- same company name
- same hostname
- same unverified phone
- same MAC claimed by multiple profiles

Never silently merge:

- two verified emails
- a guest profile into a customer with conflicting name/company
- a device owned by a revoked profile into a new profile
