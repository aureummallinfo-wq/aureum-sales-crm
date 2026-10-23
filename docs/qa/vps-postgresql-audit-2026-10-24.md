# VPS PostgreSQL audit — 24 October 2026

## Conclusion

The current production CRM runtime uses PostgreSQL on the Hostinger VPS. The inspected runtime does not select the Neon HTTP client. Removing all Neon and Vercel dependencies from the repository is a separate, unfinished code cleanup.

This was a read-only production audit through the authenticated Hostinger account and its VPS web console. No production records, environment settings, containers, database schemas, or deployments were changed. Database passwords, connection credentials, and session-secret values were not printed or copied into this report.

## Verified live configuration

| Item | Observed value |
| --- | --- |
| Hostinger VPS | `srv2071472.hstgr.cloud`, Ubuntu 24.04 with CloudPanel |
| Production domain | `https://crm.aureummall.info` |
| CRM container | `aureum-sales-crm`, image `aureum-sales-crm:main` |
| Database container | `aureum-postgres`, image `postgres:16-alpine` |
| Node environment | `NODE_ENV=production` |
| Database driver | `AUREUM_DATABASE_DRIVER=postgres` |
| Database destination | `127.0.0.1:5432/aureum_crm` — credentials redacted |
| Alternate migration URL | `DATABASE_URL_UNPOOLED` unset in CRM container |
| CRM workspace | `AUREUM_WORKSPACE_ID=workspace_default` |
| Local JSON persistence flag | `AUREUM_PERSISTENCE=0` |
| Session secret | Explicit environment value present; value not disclosed |
| Frontend origin allowlist | Production domain and local loopback origins |
| CRM networking | Host network |
| Database exposure | Host loopback port `127.0.0.1:5432` |
| PostgreSQL data persistence | Host bind mount `/opt/aureum-db/pgdata` to `/var/lib/postgresql/data` |
| CRM additional data mount | `/opt/aureum-sales-crm/data` to `/data` |
| Container restart policies | CRM and PostgreSQL both `unless-stopped` |

The environment destination was inspected with a command that parses the database URL and prints only its host, port, and database name.

## Database and application checks

The production endpoint `GET https://crm.aureummall.info/api/health/ready` returned:

```json
{"status":"ready","database":"connected"}
```

A SELECT query executed directly in the VPS PostgreSQL container returned the following counts in database `aureum_crm`:

| Table | Count at audit time |
| --- | ---: |
| `crm.workspaces` | 1 |
| `crm.users` | 13 |
| `crm.leads` | 55 |
| `crm.customers` | 25 |
| `crm.follow_ups` | 35 |

Counts establish that these records exist in the VPS database. They are not a comparison against the old Neon database and do not establish historical migration completeness.

## Deployed code versus this checkout

The VPS source directory `/opt/aureum-sales-crm` reports commit `93c9615` — `Use VPS PostgreSQL for production CRM runtime`, matching this local checkout.

A manifest covering all 345 tracked files expected in the production image matched the local manifest. `.env.example` was excluded because the Docker build excludes `.env.*`. Text line endings were normalized from CRLF to LF; binary files were hashed without text conversion. No expected files were missing from the container.

Both manifest digests were:

```text
045039b53f62a3e82f4a3d0d840ec87efe255f59a7003076795795cce279c155
```

Seven important files were also compared individually: the API server, PostgreSQL adapter, database repository, migration script, outbox worker, package manifest, and frontend runtime configuration.

## What the runtime code does

- `backend/crm-api-server.js` selects `createPostgresSql(DATABASE_URL)` when `AUREUM_DATABASE_DRIVER=postgres`. The live container has that setting.
- `backend/db/sql-client.js` uses `pg.Pool` to connect directly to PostgreSQL. It does not call a Neon API.
- The relational repository's filename and function names still contain `neon`, but the repository receives the selected SQL client. Those names do not determine where records are stored.
- With a configured database, startup uses the relational CRM schema and does not hydrate the legacy in-process seed/snapshot as the authoritative database.
- A failed PostgreSQL query does not switch the configured runtime to Neon.
- Frontend API configuration defaults to the same origin. Its inspected production file matches the local version and does not hard-code a Vercel API destination.

## Remaining cleanup and gaps

1. **Neon is still installed and imported.** `package.json` includes `@neondatabase/serverless`, `@neon/config`, and `@neon/env`. The server imports the SDK even when the PostgreSQL branch is selected. This is an unused runtime transport on the audited deployment, not evidence of a live Neon connection.
2. **The repository still defaults to Neon.** Omitting the explicit driver override selects `neon`. `.env.example` also contains Neon defaults and example URLs. A VPS-only version should default to PostgreSQL and validate production database settings.
3. **Maintenance commands still use Neon directly.** `scripts/migrate-neon.js` and `scripts/process-outbox.js` instantiate the Neon HTTP client without consulting the PostgreSQL driver setting. They need a PostgreSQL adapter before being used against the VPS database. This audit did not execute either script or establish whether a separate scheduler runs them.
4. **Old Vercel configuration remains.** Root and frontend `vercel.json`, the serverless entry point, old default allowed origins, Vercel-specific proxy checks, and related documentation remain. The active container is serving the CRM from the VPS.
5. **Logs and internal names are misleading.** The successful initialization message says `connected to Neon PostgreSQL` for both selected transports. Repository and state-sync identifiers also retain Neon names. These should be made provider-neutral or PostgreSQL-specific.
6. **Saved redeployment settings need confirmation.** `/opt/aureum-sales-crm/.env` contains production/workspace/session settings but does not contain `DATABASE_URL` or `AUREUM_DATABASE_DRIVER`. The running container has both, so additional settings were supplied at container creation. No Docker Compose file was advertised by the inspected container labels. The exact repeatable recreation command or additional environment source remains unverified. Normal Docker restarts retain the inspected container settings.
7. **Production should reject a missing database configuration.** The current code permits its local compatibility path when `DATABASE_URL` is absent. A VPS-only production setup should fail clearly instead of presenting local/test data in that situation.
8. **Persistent disk storage is not a verified backup.** The PostgreSQL bind mount was verified. A successful independent backup and restore was not tested. Historical Neon import files exist in `/opt/aureum-db`; their existence alone does not verify a current restore point.
9. **File uploads are a separate storage concern.** The current relational API reports that standalone attachment uploads require object storage. This audit verifies CRM database storage, not a complete attachment-storage implementation.

## Limits

This audit verifies the live configuration, database readiness, stored record counts, selected database code path, persisted data directory, and deployed source match. It does not certify every CRM feature, write transaction, external integration, scheduler, backup restore, old Neon data parity, or old Vercel/Neon account shutdown. The web-console connection disconnected during additional environment checks; incomplete output from those checks was not treated as evidence.

No application code was changed during the audit. The next implementation step is to remove the remaining Neon/Vercel paths, update maintenance commands and deployment instructions for PostgreSQL, test the resulting code, and review the resulting deployment before changing production.

## Follow-up implementation prepared locally

After the read-only audit, the checkout was hardened for the VPS release path. Production now defaults to PostgreSQL, rejects Neon drivers and Neon hosts, refuses a missing deployed database URL instead of using local compatibility data, and uses the selected database driver for migrations and outbox processing. The migration command is now named `scripts/migrate-database.js`; Vercel/Neon remains available only when explicitly configured for isolated previews. The full regression suite passed with 182 tests passing and one hosted readiness test skipped. These changes have not been deployed to the VPS.
