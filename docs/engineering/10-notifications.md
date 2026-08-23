# Notifications

Date: 2026-08-23

## Decision

WhoFi should support email notifications through a provider-neutral notification interface, with Resend as the first production email provider.

Email should be useful but quiet. Start with operator notifications, not noisy end-user marketing.

## Provider Modes

Supported modes:

- `disabled`: no email is sent
- `console`: render/log email in development
- `resend`: send through Resend

Default behavior:

- development: `console`
- test: `disabled`
- production: `disabled` unless explicitly configured

This keeps open-source installs safe by default.

## Initial Notification Types

MVP notification types:

- unknown persistent device
- unknown high-bandwidth device
- automation-like burst
- revoked owner online
- known agent missing heartbeat
- device blocked
- daily operator digest

Later notification types:

- captive portal guest code
- owner claim verification
- staff invitation
- weekly usage summary
- provider sync failure
- collector offline

## Email Provider Interface

Design sketch:

```ts
export type EmailProviderMode = "disabled" | "console" | "resend";

export interface EmailMessage {
  fromName: string;
  fromEmail: string;
  replyToEmail?: string | null;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export interface EmailSendResult {
  status: "sent" | "failed" | "disabled" | "skipped";
  provider: EmailProviderMode;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  emailDeliveryId?: string;
}

export interface EmailProvider {
  readonly provider: Exclude<EmailProviderMode, "disabled">;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
```

Only the Resend adapter should import or call the Resend SDK.

## Resend Adapter

Expected behavior:

- read `RESEND_API_KEY` server-side only
- send `from`, `to`, `replyTo`, `subject`, `html`, and `text`
- return provider message id on success
- return structured failure on missing key or provider error
- never expose API keys to the browser
- never log API keys, full provider responses, or secrets

Recommended package:

```text
resend
```

Recommended env:

```text
NOTIFICATION_EMAIL_PROVIDER=console
RESEND_API_KEY=
NOTIFICATION_FROM_EMAIL=
NOTIFICATION_FROM_NAME=WhoFi
NOTIFICATION_REPLY_TO_EMAIL=
NOTIFICATION_BATCH_SETTLING_MINUTES=30
```

Production should set `NOTIFICATION_EMAIL_PROVIDER=resend` only after the sender domain is verified and operator recipients are configured.

## Delivery Log

WhoFi should store email delivery attempts for audit and support.

Design sketch:

```sql
email_delivery (
  id uuid primary key,
  notification_type text not null,
  recipient_email citext not null,
  recipient_name text,
  provider text not null,
  provider_message_id text,
  idempotency_key text not null unique,
  status text not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz
)
```

## Batching And Quiet Defaults

Do not email every observation.

Recommended defaults:

- batch low-severity alerts into digest emails
- send immediate email only for critical conditions
- suppress duplicate emails with idempotency keys
- require per-recipient opt-in for high-volume alert types
- make email disabled by default in public/demo deployments

Example idempotency keys:

```text
alert:{alert_id}:opened
alert:{alert_id}:resolved
digest:{operator_id}:{yyyy-mm-dd}
collector:{collector_id}:offline:{yyyy-mm-dd-hh}
```

## Operator Configuration

Minimal operator config:

- sender display name
- sender email
- reply-to email
- notification provider mode
- digest recipient list
- critical-alert recipient list
- batch settling minutes

Location-specific config can come later.

## Security Notes

- `RESEND_API_KEY` is server-only.
- Do not include real sender domains in public fixtures.
- Do not send customer/guest emails until the product has explicit consent and templates.
- Do not include raw MAC addresses in subject lines.
- Use idempotency keys for all notification sends.
- Store delivery status, provider id, and error metadata, not secrets.
