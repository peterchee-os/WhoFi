# Current Handoff

Date: 2026-08-23

## Where We Left Off

WhoFi is a working demo-mode Next.js app with initial engineering docs and a live dashboard.

Latest completed slices:

- engineering docs for product shape, architecture, data model, connectors, deployment, security, roadmap, prior art, automation-like detection, notifications, and Resend email
- clean dashboard focused on devices, owners, bandwidth, alerts, and progressive profiles
- functional navigation: Dashboard, Devices, Usage, Profiles, Alerts, Settings
- search across device, owner, profile, and network fields
- Settings CSV/TSV roster preview and local active-profile import for demo/small-event workflows
- Profiles source filters plus imported CSV roster export/clear actions
- Profiles device owner binding CSV/TSV export and row-level preview/confirm import for local review handoff and demo recovery
- Profiles JSON operator review package export/import with preview/confirm for imported profiles, owner bindings, status/risk overrides, and ignored profile suggestions
- profile-link suggestions from hostname/person/org evidence with inspector `Assign Suggested`, Dashboard/Devices queue review, source filters, visible-batch assignment/ignore/export, ignored false-positive persistence, and restore ignored action
- device inspection panel
- dashboard source switcher for Demo, Omada, and optional Omada Printing Press CLI snapshots
- Usage view with current snapshot totals, source-filtered recent history, local retention counts and manual pruning, source-filtered JSON archive export/import with dry-run preview and confirm, snapshot trend metrics and Markdown trend reports, tunable/exportable/importable review policy thresholds, open capture review queue with workload counts, stored capture detail, selected-capture JSON/Markdown export, stored-capture replay, review notes, reviewed state, single-capture deletion, previous-capture deltas, explicit same-source comparison baselines, new/missing device movement, generated review-signal hints, and rollups by location, SSID, and AP
- local file-backed snapshot audit history at `.whofi/snapshot-history.json`, with configurable bounded full captures and `WHOFI_SNAPSHOT_HISTORY_PATH` override
- local file-backed snapshot review policy at `.whofi/snapshot-review-policy.json`, with `WHOFI_SNAPSHOT_REVIEW_POLICY_PATH` override
- local review actions: assign, reviewed, watch, block
- local alert actions: acknowledge, resolve
- localStorage persistence for demo review state
- imported CSV profiles, imported owner bindings, ignored profile suggestions, and operator review package imports persist in the same browser-local demo review state and feed Profiles, owner mix, resolution, search, suggestion evidence, and assignment dropdowns; clearing imported profiles also clears owner overrides pointing at CSV-only profiles
- JSON export of the current demo snapshot
- activity log for review actions
- safe Omada CLI doctor route that returns readiness checks only
- optional verification anchor support for client MAC or AP/BSSID MAC smoke tests
- live device snapshot gate via `WHOFI_ENABLE_LIVE_DEVICE_SOURCES`
- optional live source token via `WHOFI_LIVE_DEVICE_SOURCE_TOKEN`
- `/api/sessions` endpoint with the same source, gate, and token behavior as `/api/devices`
- `POST /api/snapshot-history/capture` endpoint for write/capture semantics; `/api/devices` remains read-only
- `GET /api/snapshot-history/export` endpoint for source-filtered JSON archives of local snapshot audit state
- `POST /api/snapshot-history/import?dryRun=true` endpoint for previewing archive import counts without writing
- `POST /api/snapshot-history/import` endpoint for confirmed JSON archive merges back into bounded local snapshot audit history
- `PATCH /api/snapshot-history` endpoint with `action: "prune"` for applying local retention limits immediately
- `GET /api/snapshot-history/{id}?compareTo={baseline_id}` support for explicit same-source capture comparison baselines
- `WHOFI_SNAPSHOT_CAPTURE_LIMIT` and `WHOFI_SNAPSHOT_HISTORY_LIMIT` env knobs for local retention ceilings
- `GET /api/snapshot-history/trends` endpoint for stored capture trend summaries and recent points
- `GET /api/snapshot-history/trends/report` endpoint for filtered Markdown trend reports
- `GET /api/snapshot-history/review-queue` endpoint for open stored capture reviews and queue summary counts
- `GET/PATCH/DELETE /api/snapshot-history/review-policy` endpoint for local review queue threshold policy lifecycle
- `GET /api/snapshot-history/review-queue/report` endpoint for filtered Markdown queue handoff reports
- `PATCH /api/snapshot-history/review-queue` endpoint for bulk marking selected review queue captures reviewed/open without clearing review notes
- `PATCH /api/snapshot-history/{id}` endpoint for review notes and reviewed/open state on stored captures
- `GET /api/snapshot-history/{id}/report` endpoint for Markdown capture reports
- `DELETE /api/snapshot-history/{id}` endpoint for removing one bad/noisy stored capture without clearing all history
- optional app-level admin gate via `WHOFI_REQUIRE_ADMIN_AUTH`, `WHOFI_ADMIN_PASSWORD`, and `WHOFI_ADMIN_SESSION_SECRET`

The UI intentionally avoids visible product-mode tabs such as event/coworking/home. The product can support those contexts internally, but the operator experience should stay focused on who and what is on the WiFi.

## Current Repo State

Expected path:

```text
/Users/peterchee/.openclaw/workspace-dev-ava/WhoFi
```

Expected branch:

```text
main
```

Check current local commits with:

```text
git log --oneline -8
```

Recent local slices before this handoff included:

```text
aa9ddcd Package local profile review state
a9f2ade Show device binding import details
9cb6a74 Preview device binding imports
fe91bf5 Import device owner bindings
6351d02 Export profile suggestion reviews
5f890dd Ignore profile suggestion false positives
8d2e3c2 Review suggested profile matches
916eccb Manage imported profile rosters
```

Note: `next dev` may update `next-env.d.ts` to reference `.next/dev/types/...`. That is generated by this Next.js version and should be inspected before committing rather than blindly reverted.

## How To Resume

Run:

```text
cd /Users/peterchee/.openclaw/workspace-dev-ava/WhoFi
git status --short --branch
npm install
npm run build
npm run dev
```

Open:

```text
http://localhost:3000
```

If port `3000` is already in use, use the next available port and tell Peter the URL.

## Next Good Build Slice

Recommended next slice:

```text
Persist device snapshots, snapshot history, and session rollups server-side
```

The demo app now has explicit live-source buttons, and `/api/devices?source=omada` / `source=omada-pp` can return real MAC/IP/hostname data only when `WHOFI_ENABLE_LIVE_DEVICE_SOURCES=true`. When `WHOFI_LIVE_DEVICE_SOURCE_TOKEN` is set, live source requests also need `X-WhoFi-Live-Source-Token`. Hosted deployments should also set `WHOFI_REQUIRE_ADMIN_AUTH=true`.

Before multi-tenant or production use, add tenant/operator access control around provider config.

Keep demo mode public-safe. Live source responses include client network identifiers and must not be exposed unauthenticated.

## Implementation Bias

Use the existing app style and local demo-data approach until the UI shape settles.

Do not start with:

- real Omada login
- real Yardi integration
- production database migrations
- packet inspection
- enterprise NAC/certificate work

Next practical order:

1. Replace the local file-backed snapshot audit history with database-backed observation/session persistence.
2. Add tenant/operator roles and durable identity around provider config and review state.
3. Demo data cleanup and responsive pass.
4. Lightweight in-memory/server-side provider interface for notifications.
5. Settings/Notifications UI polish if needed.
