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

## Admin UI

WhoFi should expose notification settings in the operator admin area, not as a public user-facing workflow.

Recommended navigation:

```text
Settings
  -> Notifications
  -> Email
```

The first version should keep this utilitarian. It should let an operator configure alert delivery without exposing secrets, provider internals, or template complexity.

### Email Settings Panel

Fields:

- provider mode: `disabled`, `console`, or `resend`
- sender display name
- sender email
- reply-to email
- operator digest recipients
- critical alert recipients
- batch settling minutes

Actions:

- save settings
- send test email
- disable email delivery
- reset to defaults

Status indicators:

- provider mode
- sender domain status: `not_configured`, `needs_verification`, `verified`, or `unknown`
- last successful send timestamp
- last failed send timestamp
- most recent provider error, redacted

The UI should never show `RESEND_API_KEY`. It may show whether a key is configured, such as `API key configured` or `API key missing`, but not the key value or prefix.

### Recipient Rules Panel

Operators should be able to decide who receives which emails.

Initial rules:

- daily operator digest
- unknown high-bandwidth device
- automation-like burst
- revoked owner online
- known agent missing heartbeat
- collector offline

Each rule should support:

- enabled/disabled toggle
- severity threshold
- recipient group: digest recipients or critical recipients
- immediate vs digest delivery

Per-location recipient rules can wait until after MVP unless the implementation already has location-aware alert routing.

### Test Email Flow

The `Send test email` action should:

1. Validate sender settings.
2. Validate that at least one test recipient is present.
3. Use the configured provider mode.
4. Create an `email_delivery` row.
5. Show success/failure in the UI without exposing provider secrets.

In `console` mode, the UI should show that a test email was rendered locally but not delivered.

In `disabled` mode, the UI should make it clear that no email will be sent.

In `resend` mode, the UI should call a server-side action/API route that uses the Resend adapter. The browser must never call Resend directly.

### Delivery Log UI

The admin area should include a simple delivery log table for support and debugging.

Columns:

- created time
- notification type
- recipient
- provider
- status
- provider message id, when available
- redacted error

Filters:

- status
- notification type
- recipient
- date range

The delivery log should not include full rendered email bodies by default. A later support-only detail view can show rendered content if it is redacted and access-controlled.

### Secret Configuration

The UI can configure non-secret notification settings. Secrets stay in environment variables or deployment secret storage.

Admin UI editable:

- provider mode
- sender name
- sender email
- reply-to email
- recipients
- batch settings
- rule toggles

Deployment-only:

- `RESEND_API_KEY`
- webhook signing secrets, if Resend webhooks are added later

If `resend` is selected and no server-side key is present, the UI should save the mode but show a blocking status message until the deployment has `RESEND_API_KEY` configured.

## Security Notes

- `RESEND_API_KEY` is server-only.
- Do not include real sender domains in public fixtures.
- Do not send customer/guest emails until the product has explicit consent and templates.
- Do not include raw MAC addresses in subject lines.
- Use idempotency keys for all notification sends.
- Store delivery status, provider id, and error metadata, not secrets.
