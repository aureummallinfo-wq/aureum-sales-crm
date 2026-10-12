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

The API must report `Aureum CRM connected to Neon PostgreSQL`. The outbox command intentionally does nothing until `N8N_WEBHOOK_URL` is configured.

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
