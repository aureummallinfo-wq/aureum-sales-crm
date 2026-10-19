# CRM speed and recovery priorities

This plan is based on the current code and the manager/agent mock tests. These are engineering priorities, not measured production capacity or claims that hosted monitoring/backups are already configured.

The tested fixes already remove duplicate startup, preserve sign-in on refresh, avoid a customer-edit reload race, validate profile changes before saving, revoke local sessions and restore local Tasks.

## Recommended order

| Priority | Improvement | Why it matters for this CRM | Evidence / completion check |
|---|---|---|---|
| 1 — Protect data | Confirm Neon recovery history, schedule separate backups and practise restoring into an isolated branch/database | A failed deployment or bad update needs a known recovery route | Restore an actual backup and verify lead/customer/follow-up counts and relationships. Record how much recent data could be lost and how long recovery takes. |
| 1 — Detect failure | Monitor errors, slow requests and service availability; add lightweight liveness and database-readiness checks | Learn about an outage before staff report blank or slow screens | Alert on sustained 5xx errors, latency and failed readiness. Use request IDs and sanitized logs without credentials or customer notes. |
| 1 — Recover background work | Give outbox delivery an HTTP timeout, retry backoff, a processing lease and a recovery rule for expired leases | `scripts/process-outbox.js` claims pending/failed jobs as processing. A crash leaves processing jobs outside the next claim query; delivery fetch also has no explicit timeout | Kill a test worker after claiming a job; another worker must eventually reclaim it. Delivery must use the existing idempotency key so retries do not repeat external side effects. |
| 2 — Faster lists | Add server-side pagination, bounded page sizes and database filters to leads, customers, follow-ups and chat history | `listLeads` currently returns the whole matching list, and several screens filter/render complete arrays | A normal screen loads one page, such as 25–50 rows. Test 1,000 and 10,000 records; compare payload size, query time and browser interaction time. Use a stable ordering/cursor and preserve role/workspace scope. |
| 2 — Faster dashboard | Fetch one dashboard response and calculate counts/charts in SQL; share identical in-flight reads | Each dashboard widget calls `reportData`, which loads users, leads, customers and follow-ups again. The recent-leads route also reloads leads | One page load should not repeat the same full data reads for each widget. Cache only with account/workspace/role/filter keys and invalidate after relevant writes. Never share private role-scoped data across accounts. |
| 2 — Avoid server stalls | Move request-time password hashing to asynchronous crypto; keep the JSON snapshot backend for development | `passwordHash` uses `scryptSync`; local persistence writes the full snapshot synchronously. Both can hold up the Node event loop | Test simultaneous sign-ins and normal reads. Keep password strength and hashes compatible; do not weaken hashing to gain speed. Production should keep using the relational database rather than fall back to memory. |
| 3 — Safer saves and releases | Add idempotency for retried creates, disable repeated form submission while saving, retain unsaved text after errors, and gate releases on tests | A slow or lost connection must not create duplicate leads/tasks or make an agent lose notes | Double-click Save, lose the response, retry and verify one record. Run manager/agent browser checks in a separate staging workspace before release. Keep migrations compatible with rollback. |

## Measure before increasing hosting size

Track page-load time, API p50/p95 latency, error rate, response size, database query duration, and pending/failed/stuck job counts. Run load tests against disposable staging data with progressively more concurrent users and records; never load-test the live customer workspace by default.

Use query plans before adding indexes. Candidate filters in this CRM include workspace, assigned agent/team, status and due/created date; verify existing indexes before adding more. More infrastructure cannot compensate for repeated unbounded reads.

Practise failures as well as successful journeys: database unavailable, connection lost during Save, duplicate submission, worker killed after claiming a job, deployment rollback, and backup restoration. Confirm that each case ends with either a saved record or a clear retry path, with no silent partial writes.

## Operational references

- [Neon history window](https://neon.com/docs/postgres/backup-restore/history-window) explains how retained change history controls point-in-time recovery; check the actual project setting and plan rather than assuming a retention period.
- [Vercel Observability](https://vercel.com/docs/observability) and [Alerts](https://vercel.com/docs/alerts) describe hosted performance/error visibility and alerting; availability depends on the project plan/configuration.
- [Node.js guidance on blocking work](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop) explains why synchronous CPU work and filesystem operations can delay other requests.

These operational settings and further optimizations have not been applied by the mock-test bug-fix change.
