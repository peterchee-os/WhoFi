# Printing Press Omada Spike

Date: 2026-08-23

## Question

Can WhoFi use a Printing Press generated CLI for the Omada network connector?

## Verdict

Yes, but as a connector accelerator first, not as a drop-in replacement yet.

Omada is a strong Printing Press candidate because the useful Essentials client telemetry route was discovered through browser traffic rather than a clean public OpenAPI spec. Printing Press can turn captured traffic into a spec and then a Go CLI/MCP scaffold. That matches the kind of surface WhoFi needs for:

- read-only controller diagnostics
- site/client/AP listing
- agent-friendly JSON output
- repeatable local sync/debug workflows
- future CLI reuse outside the web app

## What Worked

Printing Press installed successfully when run with the Go 1.26 toolchain expected by the project.

The Omada HAR was accepted by `browser-sniff` and produced:

- a sniffed API spec
- traffic analysis
- redacted endpoint samples
- broad endpoint coverage for Omada Cloud, Omada Central, and the Essential Controller

A focused read-only spec for the WhoFi path generated and built a Go CLI skeleton with:

- `auth login`
- `auth init-info`
- `clients <controller_id> <site_id>`
- JSON/table output modes
- agent-friendly flags
- MCP server scaffold
- local config/data/cache/state paths

## What Did Not Work Yet

The full sniffed spec was too noisy to generate cleanly as-is. It captured a broad Omada web-console surface, including account/central/controller endpoints that are not all useful for WhoFi.

The generated focused CLI is a scaffold, not a finished Omada client. Omada Essentials needs a web-console session convention:

- login through the controller `/api/v2/login` route
- capture the CSRF/session token
- optionally fetch current user init info for `User-Id`
- call the clients OpenAPI endpoint without a Bearer authorization header
- include console-style headers such as `X-Requested-With` and `Omada-Request-Source`
- send the HAR-observed active-client POST body

Printing Press generated endpoint wrappers, but it did not automatically infer this multi-step session flow as a first-class auth provider.

## Recommendation

Use Printing Press for Omada in this order:

1. Keep WhoFi's current TypeScript Omada connector as the app runtime path.
2. Maintain a private focused Printing Press spec for Omada Essentials read-only telemetry.
3. Patch the generated CLI's auth/session layer to match the proven HAR request convention.
4. Use the CLI for diagnostics and repeatable connector tests.
5. Reuse the stable pieces back into WhoFi only after the CLI passes live read-only smoke tests.

Do not publish a public Omada CLI until the auth/session approach is stable and does not expose private captured traffic, controller IDs, site IDs, MACs, IPs, cookies, tokens, or organization data.

See also:

- [Omada Printing Press Architecture](13-omada-printing-press-architecture.md)
- [Omada Printing Press Implementation Plan](14-omada-printing-press-implementation-plan.md)

## Candidate CLI Commands

```text
omada-essential-pp-cli doctor
omada-essential-pp-cli auth login
omada-essential-pp-cli auth init-info <controller_id>
omada-essential-pp-cli clients <controller_id> <site_id> --page 1 --page-size 100 --json
```

Future hand-polished commands that would be more useful to WhoFi:

```text
omada-essential-pp-cli sites list
omada-essential-pp-cli aps list --site <site>
omada-essential-pp-cli clients active --site <site> --json
omada-essential-pp-cli clients sync --site <site>
omada-essential-pp-cli usage top --site <site> --since 24h
omada-essential-pp-cli whofi observations --site <site>
```

## Product Boundary

Printing Press should not replace WhoFi.

WhoFi remains:

- product UI
- device ledger
- profile resolution
- review workflow
- alerting
- database and history

The printed Omada CLI can become:

- connector test harness
- operator/debug tool
- portable read-only sync runner
- future worker-side implementation detail
