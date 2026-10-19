# Aureum CRM deployment runbook

## Required runtime configuration

Set these variables in the Vercel project and in the production worker environment. Do not commit their values.

```text
DATABASE_URL                 # Neon pooled runtime connection
DATABASE_URL_UNPOOLED        # Neon direct migration connection
N8N_WEBHOOK_URL              # n8n outbox consumer endpoint
N8N_WEBHOOK_SECRET           # shared outbox request secret
```

The following integrations are optional for the CRM API but required for their full production features:

```text
RESEND_API_KEY               # access and password-reset email delivery
BLOB_READ_WRITE_TOKEN        # object storage for standalone chat uploads
```

## Local verification

```powershell
pnpm install
pnpm db:migrate:dry
pnpm db:migrate
pnpm check
pnpm test
pnpm qa
pnpm outbox:process
pnpm start
```

The first API request initializes the database and must report `Aureum CRM connected to Neon PostgreSQL`. An unauthenticated `GET /api/auth/me` returns 401 when initialization succeeds; a 200 response from a page such as `/follow-ups` only confirms that the app shell can load. The outbox command intentionally does nothing until `N8N_WEBHOOK_URL` is configured.

## Database startup failures

Pages and static assets remain available during a database initialization failure. API requests return HTTP 503 with `code: DATABASE_UNAVAILABLE` and `Retry-After: 5`. Concurrent requests share one initialization attempt; after a failed attempt, a later API request can retry after the five-second cooldown. Production never falls back to local demo records, and rejected writes do not queue a legacy snapshot sync.

If this occurs in production, inspect the Vercel function logs for `CRM database initialization failed` and its exception. Check Neon connectivity, required migrations and the deployment's `DATABASE_URL` and `AUREUM_WORKSPACE_ID`. The generic JSON error alone does not identify which of these failed. A missing workspace continues to block API access until its configuration or database record is corrected.

## Request protection and screen recovery

Apply `db/migrations/010_request_rate_limits.sql` through the release migration process **before deploying** this runtime. The standard migration script includes it. Production request budgets use atomic Neon counters shared across instances. A missing counter table blocks API work with `REQUEST_PROTECTION_UNAVAILABLE`; pages and liveness continue to load. Local mode uses bounded in-memory counters.

| Request category | Default per minute | Identity |
|---|---:|---|
| Login | 30 | Client IP |
| Ordinary reads | 300 | Authenticated user and workspace |
| Ordinary writes | 60 | Authenticated user and workspace |
| Imports, previews, exports | 10 | Authenticated user and workspace |
| Public webhook ingestion | 120 | Connection and client IP |
| Unauthenticated API traffic | 120 | Client IP |

Overrides are documented in `.env.example`. These defaults are initial safeguards, not measured capacity guarantees; tune them using real traffic, including polling and multiple tabs. Limit responses use HTTP 429 with `Retry-After`. Forwarded IP headers are trusted only on Vercel. A bounded per-instance ingress budget (3,000/IP/minute) runs before database work, and the API admits at most 40 active requests per instance. These local guards supplement the shared counters; hosting firewall rules can reject abuse before function invocation.

Neon HTTP calls get a fresh 10-second timeout and share an 18-second request deadline. Timeout signals also cover reading the database response body. Client requests retain their 20-second deadline through response-body parsing. A timeout does not prove that a database write was cancelled: writes are never automatically replayed, and an uncertain save prompts the user to refresh the record before trying again. Identical simultaneous client saves share one in-flight request; this does not provide durable idempotency across refreshes or different clients.

Each screen renders inside an error boundary; inactive screens are not evaluated. A failed screen keeps the sidebar and a Retry action. Drawers can be closed after render errors. A transient startup session-check error displays a recovery screen; a confirmed HTTP 401 still requires sign-in. Recovery rechecks the existing cookie and restores the requested route.

Use `GET /api/health/live` for process liveness (no database dependency) and `GET /api/health/ready` for initialization plus a fresh database query. Readiness returns only service status, not account data. `X-Request-Id` identifies failed API requests in sanitized runtime logs. External monitoring, alert destinations, firewall settings, backups and restore drills still require deployment/account configuration.

## Vercel deployment sequence

1. Add the variables above to Preview and Production environments.
2. Deploy the repository with the existing Vercel project configuration.
3. Run the migration command from a controlled CI/release environment using `DATABASE_URL_UNPOOLED`; do not run schema changes from a request handler.
4. Verify login, role boundaries, `/api/reports`, `/api/settings/webhooks`, and a signed public webhook request against the production URL.
5. Run the outbox worker on a scheduler or n8n polling/trigger workflow. Treat `crm.outbox_events` as the durable source and use `idempotency_key` for retries.

## Current known blockers

- No n8n URL/secret is configured in the local environment, so no external outbox delivery has been attempted.
- No email provider key is configured; access/reset actions persist onboarding state but return a draft delivery status.
- No object-storage token is configured; chat messages can persist attachment metadata/content, while the standalone upload endpoint returns a storage-required response.
- Vercel project identifiers and production deployment have not been configured in this workspace.
