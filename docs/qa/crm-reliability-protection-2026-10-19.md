# CRM request protection and failure recovery

Implemented locally on October 19, 2026. Production configuration, migrations and deployment were not changed.

## Implemented behavior

- Database initialization failures never replace pages or assets with JSON. Failed initialization can be retried after five seconds, with concurrent API requests sharing an attempt.
- Each Neon HTTP operation has a fresh timeout, combined with its API request deadline. Normal query composition and transactions retain the driver's lazy interface.
- Production API rate limits use atomic PostgreSQL counters shared across instances. Users, workspaces and request categories have separate budgets. Local ingress and concurrency guards bound work before database calls.
- Login, webhook and ordinary request bodies are bounded. Oversized, malformed and stalled bodies receive explicit errors. Request IDs and sanitized error logs support diagnosis.
- The final renderer evaluates only the current screen. Screen errors leave navigation available; drawer errors offer a close action. Transient session-check failures offer Retry without clearing the session cookie; a confirmed 401 still requires sign-in.
- The browser timeout covers response-body parsing. Identical simultaneous saves share one in-flight operation. Writes are never automatically replayed, and ambiguous save failures instruct the user to refresh first.
- Public liveness and readiness endpoints distinguish a working process from database availability. External alerting is not configured by this change.

## Verification

- `npm run check`: passed.
- Final pre-push `npm test`: 177 passed, 0 failed, 1 hosted Neon readiness test skipped.
- Final database failure regression run: 7 passed, including webhook database timeouts returning a retryable service response rather than an invalid-payload response.
- PostgreSQL-compatible PGlite tests verified concurrent quotas shared by independent stores, identity isolation, expiration, and repeatable migration application.
- API tests verified 429 responses, independent read/write/user budgets, bounded bodies, overload rejection, timeout recovery, and availability of pages/liveness during saturation.
- Browser-runtime tests verified screen and drawer isolation, session recovery, confirmed session expiry, duplicate concurrent saves, stalled response bodies, and malformed responses.

## Release requirements and limits

Apply `db/migrations/010_request_rate_limits.sql` before deploying the runtime. A missing shared budget table intentionally blocks API processing with HTTP 503; it never falls back to unprotected production traffic or demo records. See the deployment runbook for default limits, environment overrides and health-check paths.

Limits need tuning from production traffic; they are not load-test capacity results. A client-side shared save promise is not durable idempotency across refreshes or devices. An HTTP timeout cannot prove that a write was cancelled in PostgreSQL. Hosting firewall rules, external alerts, backups, restore drills, full server-side list pagination and background worker recovery remain separate deployment or engineering work.
