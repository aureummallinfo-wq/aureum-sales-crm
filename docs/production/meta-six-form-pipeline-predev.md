# Meta six-form pipeline — pre-production implementation

## Goal

Deliver every Meta lead from the six active form tabs into Aureum CRM exactly once, with a clear distinction between **queued**, **delivered**, **confirmed in CRM**, and **failed**. Keep the Google Sheet as the canonical intake source and preserve all historical rows.

## Canonical data path

```text
Meta forms (6)
  -> Apps Script consolidation
  -> Professional CRM tab
  -> n8n polling workflow
  -> CRM webhook POST
  -> CRM verification GET
  -> sync register / retry state
```

n8n must poll `Professional CRM` only. It must not also poll the six raw form tabs, because doing so creates two independent delivery paths and makes the sync register unreliable.

## Required row rules

Process a row only when all of the following are true:

- `id` is a real Meta lead ID, not the literal header value `id`.
- `source_tab` is one of the six active Meta form tabs.
- The row is not a blank row, archive row, or report/header row.
- The Meta lead ID is not already confirmed in the sync register.

The Meta lead ID is the idempotency key. Phone, email, and name are secondary audit fields and must not replace the Meta ID for delivery identity.

## Delivery state machine

| State | Meaning | Next action |
|---|---|---|
| `pending` | Row is eligible but has not been sent | POST to CRM |
| `accepted` | CRM accepted the request and returned a CRM lead ID | Verify persistence |
| `confirmed` | CRM verification returned `confirmed:true` | Mark the sync register sent |
| `retry` | POST or verification failed temporarily | Retry with bounded backoff |
| `failed` | Permanent mapping/authentication/data failure | Preserve error and alert for review |

An HTTP 200 from the POST is not sufficient to mark a row sent. n8n must call:

```text
GET /api/webhooks/leads/{connectionId}/verify?external_lead_id={MetaLeadId}
X-Aureum-Webhook-Secret: <secret>
```

Only `200` with `confirmed:true` is a successful delivery. A `404` means the CRM has not persisted the lead yet and must remain retryable.

## Apps Script reliability gates

Before live reconciliation:

1. Read each raw tab in one batch and write the consolidation range in one batch.
2. Use a script lock so overlapping five-minute executions cannot duplicate work.
3. Skip header rows by validating the Meta ID format before appending.
4. Persist the last consolidated row or Meta ID per source tab.
5. Alert immediately on timeout or non-zero execution status; daily summaries are insufficient for lead delivery.

## Historical reconciliation

The backfill is non-destructive:

1. Read all six raw tabs and `Professional CRM`.
2. Match by Meta lead ID first; use phone/email only for a manual-review report.
3. Send only IDs absent from the confirmed sync register.
4. Verify each CRM save before recording `confirmed`.
5. Produce a report of confirmed, pending, retry, failed, duplicate, and manually entered CRM leads.

No existing Sheet row, sync-register row, CRM lead, or historical execution record is deleted.

## Pre-production acceptance gates

- All six source tabs are represented in `Professional CRM`.
- No duplicate Meta IDs exist in the canonical tab.
- A new row reaches CRM and is confirmed by its Meta ID.
- A temporary CRM 404 remains retryable and is not marked sent.
- Replaying the same row does not create a second CRM lead.
- A failed row retains its error stage/message and is visible for reconciliation.
- The master workflow reads one canonical tab only.
- Apps Script runs do not overlap and do not append a header row.
- The full historical report reconciles Sheet, n8n, and CRM counts without deleting records.

## Current pre-production status

- CRM verification endpoint: implemented for local and Neon-backed CRM paths.
- Verification tests: added for confirmed and not-yet-persisted leads.
- Syntax and project checks: passing.
- n8n `CRM Sync Register`: prepared with `external_lead_id`, `sync_status`, `source_tab`, `verified_at`, and `attempt_count` technical fields; existing error/timestamp fields were preserved.
- Live master workflow draft: the sent-key reader is aligned to the existing `status` writer; a CRM verification GET now sits between the delivery POST and the sync-register upsert; the upsert maps `external_lead_id`, `sync_status`, `source_tab`, `verified_at`, `attempt_count`, and `failure_stage`.
- Live master workflow source: `Read Professional CRM` is now the only active sheet reader on the delivery path. The five other raw-sheet readers and the old combine node are deactivated, and the canonical reader feeds validation directly.
- Live master workflow schedule: configured for a four-hour polling interval, with the workflow still left unpublished for controlled pre-production testing.
- Live execution history: failed, successful production, and manual execution retention are explicitly set to `Save`; existing historical records were not cleared.
- Live publish gate: the n8n draft has not been published. A read-only manual execution of `Read Professional CRM` returned 350 rows without reaching CRM delivery; before publishing, run one controlled test row and confirm the register gets `status=sent` only after the CRM verification returns `confirmed:true`.
- Apps Script: added and installed `consolidateNewLeadsPredev`, a `LockService`-guarded wrapper around the existing consolidator; the legacy trigger was replaced and the Triggers page now shows one `consolidateNewLeadsPredev` time-based trigger. The historical 360-second timeout remains retained for audit, while new runs must be monitored for completion and error rate.
