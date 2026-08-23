create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists profile (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  profile_type text not null check (
    profile_type in (
      'guest',
      'event_attendee',
      'drop_in',
      'customer',
      'staff',
      'vendor',
      'agent',
      'machine',
      'unknown'
    )
  ),
  profile_level text not null default 'seen' check (
    profile_level in ('seen', 'claimed', 'verified', 'linked', 'operational')
  ),
  organization_name text,
  email citext,
  phone text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists identity_link (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  provider_type text not null,
  provider_id text not null,
  external_ref text not null,
  confidence numeric(5, 2) not null default 1.0,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider_type, provider_id, external_ref)
);

create table if not exists network_provider (
  id uuid primary key default gen_random_uuid(),
  provider_type text not null,
  display_name text not null,
  external_ref text,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists location (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  network_site_ref text,
  external_property_ref text,
  created_at timestamptz not null default now()
);

create table if not exists device (
  id uuid primary key default gen_random_uuid(),
  mac_hash text not null unique,
  mac_display text,
  hostname text,
  profile_id uuid references profile(id) on delete set null,
  status text not null default 'unknown' check (
    status in ('unknown', 'claimed', 'staff_assigned', 'managed', 'agent_host', 'revoked', 'ignored')
  ),
  risk_state text not null default 'normal' check (
    risk_state in ('normal', 'watch', 'automation_like', 'possible_bot', 'known_agent', 'needs_review')
  ),
  private_mac_suspected boolean not null default false,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists network_observation (
  id uuid primary key default gen_random_uuid(),
  network_provider_id uuid references network_provider(id) on delete set null,
  location_id uuid references location(id) on delete set null,
  device_id uuid references device(id) on delete set null,
  observed_at timestamptz not null,
  event_type text not null,
  mac_hash text not null,
  hostname text,
  ip inet,
  ssid text,
  ap_name text,
  rx_bytes bigint not null default 0,
  tx_bytes bigint not null default 0,
  burst_score integer,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists wifi_session (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references device(id) on delete cascade,
  network_provider_id uuid references network_provider(id) on delete set null,
  location_id uuid references location(id) on delete set null,
  profile_id uuid references profile(id) on delete set null,
  ssid text,
  ap_name text,
  started_at timestamptz not null,
  ended_at timestamptz,
  last_seen_at timestamptz,
  rx_bytes bigint not null default 0,
  tx_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists alert (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references device(id) on delete set null,
  profile_id uuid references profile(id) on delete set null,
  title text not null,
  details text not null,
  severity text not null check (severity in ('info', 'watch', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  label text not null,
  opened_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists notification_settings (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'global',
  email_provider text not null default 'disabled' check (email_provider in ('disabled', 'console', 'resend')),
  from_name text not null default 'WhoFi',
  from_email citext,
  reply_to_email citext,
  digest_recipients citext[] not null default '{}',
  critical_recipients citext[] not null default '{}',
  batch_settling_minutes integer not null default 30,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope)
);

create table if not exists email_delivery (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  recipient_email citext not null,
  recipient_name text,
  provider text not null,
  provider_message_id text,
  idempotency_key text not null unique,
  status text not null check (status in ('sent', 'failed', 'disabled', 'rendered', 'skipped')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz
);

create table if not exists review_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profile(id) on delete set null,
  device_id uuid references device(id) on delete set null,
  alert_id uuid references alert(id) on delete set null,
  action text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_profile_type on profile(profile_type);
create index if not exists idx_device_profile_id on device(profile_id);
create index if not exists idx_device_status on device(status);
create index if not exists idx_device_risk_state on device(risk_state);
create index if not exists idx_network_observation_observed_at on network_observation(observed_at desc);
create index if not exists idx_network_observation_device_id on network_observation(device_id);
create index if not exists idx_wifi_session_device_id on wifi_session(device_id);
create index if not exists idx_wifi_session_started_at on wifi_session(started_at desc);
create index if not exists idx_alert_status on alert(status);
create index if not exists idx_email_delivery_created_at on email_delivery(created_at desc);
