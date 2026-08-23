# Omada Printing Press Implementation Plan

Date: 2026-08-23

## Goal

Turn the Omada Printing Press spike into a useful read-only connector tool without blocking the main WhoFi app.

## Current State

Completed:

- `cli-printing-press` installed successfully using Go 1.26.
- Omada HAR processed with `browser-sniff`.
- Broad sniffed output discovered Omada Cloud, Central, and Essential Controller endpoints.
- Full sniffed output was too noisy to generate directly.
- Focused read-only Omada spec generated a CLI skeleton.
- Generated CLI builds after `go mod tidy`.
- Generated command surface includes:
  - `auth login`
  - `auth init-info`
  - `clients <controller_id> <site_id>`

Known issue:

- Generated endpoint wrappers do not yet implement Omada's multi-step web-console auth/session convention.

## Phase 1: Keep The Private Spike Organized

Private spike artifacts should stay outside the public WhoFi repo.

Suggested private layout:

```text
whofi-private-spikes/
  omada-printing-press/
    README.md
    discovery/
      traffic-analysis.json
      samples/
    specs/
      omada-essential-focused.yaml
    generated/
      omada-essential-pp-cli/
    notes/
      live-test-results.md
```

The private spike README should include:

- toolchain version
- commands used
- what generated cleanly
- what failed
- how to rebuild
- how to run a private live test

Do not copy private artifacts into `WhoFi/docs` unless they are manually sanitized.

## Phase 2: Patch Generated Auth

Add a generated-CLI auth session layer:

```text
auth login
  -> stores token/cookie in local state or process memory

auth init-info
  -> stores user id when available

clients active
  -> loads token/user id
  -> sends console-style headers
  -> sends HAR-proven client-list body
```

Implementation details:

- password should come from env/config/secret manager, never command history by default
- token/cookie should be stored only in local private state with restrictive permissions
- `doctor` should detect missing base URL, controller id, site id, username, and password
- live calls should redact errors
- `--json` output should not log headers

Expected env names:

```text
OMADA_ESSENTIAL_BASE_URL
OMADA_ESSENTIAL_CLOUD_PORTAL_URL
OMADA_ESSENTIAL_CONTROLLER_ID
OMADA_ESSENTIAL_SITE_ID
OMADA_ESSENTIAL_USERNAME
OMADA_ESSENTIAL_PASSWORD
```

These are CLI-specific names. WhoFi app env names may remain `OMADA_*`.

## Phase 3: Add WhoFi-Native Commands

The generated command surface is technically correct but not operator-friendly enough.

Add hand-polished commands:

```text
omada-essential-pp-cli clients active
omada-essential-pp-cli observations list
omada-essential-pp-cli observations sync
omada-essential-pp-cli sites current
omada-essential-pp-cli doctor --live
```

`observations list` should emit WhoFi's normalized network observation shape.

`observations sync` can later write to:

- stdout JSON
- local SQLite
- WhoFi API endpoint
- file sink for collector mode

## Phase 4: Smoke Tests

Required tests before WhoFi depends on the CLI:

```text
doctor without env -> fails with missing config names only
doctor with env -> validates base URL and auth readiness
auth login -> returns no token in human output
clients active --json -> returns active clients
observations list --json -> returns normalized observations
bad password -> redacted auth failure
bad site id -> redacted API failure
no network -> timeout with useful error
```

Never commit live test output with real client data.

## Phase 5: Decide Runtime Integration

After the CLI has stable auth and smoke tests, decide whether WhoFi uses it at runtime.

Acceptance criteria:

- CLI live test is as reliable as the TypeScript connector.
- CLI output contract matches `NetworkObservation`.
- CLI errors are machine-readable.
- CLI can run in Docker or a hosted worker.
- CLI does not require interactive auth.
- CLI has a documented release/version pinning story.

If accepted:

```text
WhoFi Omada provider
  -> checks config
  -> runs omada-essential-pp-cli observations list --json
  -> validates output
  -> persists observations
```

If not accepted:

```text
WhoFi Omada provider
  -> keeps TypeScript connector
  -> uses CLI only for diagnostics and connector tests
```

## Documentation To Keep In Sync

When this work advances, update:

- `04-provider-connectors.md`
- `05-deployment-and-config.md`
- `12-printing-press-omada-spike.md`
- `13-omada-printing-press-architecture.md`
- this implementation plan

## Pause Point

Current best next task:

```text
Patch generated omada-essential-pp-cli auth/session handling in the private spike folder,
then run a private live read-only clients-active smoke test.
```

Do not move the generated CLI into the public WhoFi repo until it passes that smoke test and has been scrubbed for private artifacts.

