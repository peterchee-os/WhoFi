# Database

WhoFi targets Postgres for production/self-hosted installs.

The app still runs in demo mode without a database. These migrations define the persistence contract before runtime wiring.

## Apply Locally

Example:

```text
createdb whofi_dev
psql whofi_dev -f db/migrations/0001_initial.sql
```

## Design Rules

- Use generated UUID primary keys.
- Store normalized WiFi observations separately from current device state.
- Keep provider identifiers as external references, not hardcoded product assumptions.
- Keep notification secrets outside the database.
- Do not store packet contents or browsing history.

