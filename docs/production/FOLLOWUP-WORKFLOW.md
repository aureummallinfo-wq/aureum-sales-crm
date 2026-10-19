# Follow-up workflow

The main Follow-ups list has one current row per existing customer in the signed-in advisor's scope. Scheduling a lead's first follow-up creates its customer profile. Click the customer or **Reschedule** to enter a call note, select a future date and Pakistan time, and choose an existing CRM tag (default **Follow-up Needed**). **Reschedule** updates the same reminder and changes Overdue to Contacted. The selected tag is saved on the reminder and added to the customer and linked lead without removing their other tags.

The full table shows customer, phone / WhatsApp, type, assigned agent, lead status, due date, due time, priority, status and last activity. Each row has an **Actions** dropdown containing only **Reschedule** and **Add note**. Use the top **+ Schedule follow-up** button to create a schedule. **Add note** records a note and activity without changing the contact date, Contacted outcome, overdue status, or last-contacted timestamp. Scheduling from the customer profile uses the same date, time, note and tag form.

The Follow-ups table's **Last activity** column displays only the activity date and Pakistan time. An unavailable timestamp displays a dash. Descriptions and advisor names are omitted from this column; recorded notes and activity history remain stored.

| Action | Follow-up result | Last activity |
| --- | --- | --- |
| Save a call and next contact | Contacted until its new deadline, then Overdue | Latest response, agent, timestamp |
| Add an internal note | Defers an overdue reminder by 2 days by default; the note form can choose a different interval | Latest note, agent, timestamp |
| Use Add note on the Follow-ups screen | Keeps the current deadline and status | Latest note, agent, timestamp |
| Edit tags, customer status, or profile | Keeps the existing deadline | Description of the latest change, agent, timestamp |
| Save a call with no next follow-up | Contacted with no open deadline | Latest response, agent, timestamp |

The customer's sales status remains independent. Last contacted changes only when contact is explicitly recorded. Previous responses remain in notes and activities; previous dates remain in reschedule history. Old duplicate open reminders are marked Cancelled with a consolidation reason when the current reminder is saved, retaining their notes and activity. List reads do not create reminders or reset activity.

## Storage and validation

An active Contacted reminder uses the existing database status `Rescheduled` and metadata `outcome: Contacted`. A Contacted reminder with no next date uses `Completed`. The API exposes both the display `status` and the storage `lifecycle_status`; `completed_at` distinguishes a closed contact from a future commitment. This requires no new database enum or schema migration.

Notes, follow-up changes, status history, activity, and audit/outbox events are written in one PostgreSQL statement. Related next-contact pointers are refreshed afterward. Schedules are interpreted in `Asia/Karachi`; a custom schedule must be a valid future date and time. Ownership checks apply to note actions and reminder consolidation. The list groups legacy records before display so a customer is not repeated.

## Portal and customer isolation

Reminders must resolve to an active customer and lead in the same workspace, with matching current advisor and team ownership. Deleted, unlinked, mismatched and foreign-workspace reminders are excluded from lists, search, dashboard/report aggregates and notification feeds. Detail and mutation routes use the same relationship check. Imported metadata cannot substitute for a missing customer or owner. Legacy lead-only reminders are included only when their lead already has a matching customer profile; reads do not manufacture customer records to make the counts agree. Invalid records remain stored for review.

Creation rejects a customer/lead mismatch or an advisor different from the customer's owner. Lead reassignment moves the lead, customer and consistent reminders in one PostgreSQL statement, so a failed reminder update rolls back the ownership changes. Managers retain team access; advisors retain personal access. Startup no longer merges legacy teams.

`AUREUM_WORKSPACE_ID` selects the server's fixed `crm.workspaces.legacy_id` (default `workspace_default`). Each separately hosted city portal must select its own workspace. Session tokens from another workspace are rejected. Browser caches include workspace, advisor, role, team and session revision; profile changes clear loaded records and prevent older responses from repopulating the new profile.

The isolation regression test constructs three assigned customers, duplicate reminders, a colleague's customers, missing/deleted customer relationships and another city workspace. It verifies three current rows, API action denials, notification filtering, portal-bound sessions and reassignment rollback. Browser-state tests cover switching between two advisors, late responses, workspace/team changes and sign-out.

## Verification

`src/tests/functional/followup-pipeline.functional.test.js` runs the repository against in-memory PostgreSQL using PGlite and the production schema. It covers same-row contact updates, latest activity, tag edits, snoozing, deadline expiry, closure and reopening, duplicate consolidation, note history, and custom dates. `src/tests/functional/followup-workflow-api.functional.test.js` covers the sales-agent API flow and ownership rejection. PGlite is a development dependency; the application continues to use Neon in production.
