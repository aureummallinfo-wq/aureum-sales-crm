# Aureum CRM Neon architecture

## Source of truth

The production schema lives under the `crm` PostgreSQL schema. New records use UUID primary keys and retain the old application IDs in `legacy_id` columns during the API migration. The original `public.aureum_crm_state` table is retained as a recovery and compatibility snapshot; it is not the target architecture. Only compatibility-handled requests queue idempotent reconciliation; relationally handled requests remain authoritative in Neon and do not write back to the snapshot.

Application traffic must use pooled `DATABASE_URL`. Migration commands must use direct `DATABASE_URL_UNPOOLED`.

## Migration commands

```powershell
pnpm run db:migrate:dry
pnpm run db:migrate
```

The importer is idempotent, preserves legacy IDs, and does not drop production tables. Neon branching should be used to test schema changes before applying them to `production`.

## Relationships

- `crm.workspaces` owns teams, users, CRM records, notifications, webhooks, automation events, and outbox events.
- `crm.users` belong to teams and own/assign CRM records.
- `crm.leads` can convert to exactly one `crm.customers` row through the unique `customers.lead_id` relationship.
- Leads use status/source lookup tables and the `lead_tag_assignments` many-to-many table.
- Customers and leads have separate notes, activity, and history tables.
- Follow-ups belong to a lead, a customer, or both and have status history.
- Chat messages use an XOR check so each message belongs to exactly one channel, group, or direct conversation.
- Webhook events use `(connection_id, idempotency_key)` uniqueness to prevent duplicate imports.
- Business events are published through `crm.outbox_events`; n8n is a consumer, not the system of record.

## Retention and automation

`crm.data_retention_policies`, `crm.scheduled_jobs`, and `crm.job_runs` provide the control plane for cleanup and scheduled workers. Complex automation remains in the Node service or n8n; PostgreSQL triggers only maintain `updated_at` and structural consistency.

## Current migration status

The schema and importer are complete, and the current Neon snapshot has been imported. Authentication, leads, customers, follow-ups, notifications, chat, users/agents, search, dashboards, reports, settings, webhook management, and public webhook ingestion now use `backend/db/neon-repository.js` through the relational API adapter. The normalized `crm` schema is the authoritative read/write path for those modules; the legacy JSON snapshot remains only as a compatibility/recovery layer for older endpoints and local fixtures. Relationally handled requests do not write back to the snapshot, preventing the legacy layer from becoming a second source of truth.

The outbox worker is available at `pnpm run outbox:process`, and lead/customer/follow-up/chat mutations enqueue events. It will not deliver externally until `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` are configured. Email delivery, attachment/object storage, Vercel environment variables, and the production deployment/health-check process still need to be configured before calling the system production-ready.

Do not call the system production-ready until every route reads and writes the `crm` schema and the parity/transaction tests pass.
