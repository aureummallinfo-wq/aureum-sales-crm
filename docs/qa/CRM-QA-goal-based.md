# CRM date filtering and feature QA

## Goal

Every operational CRM list screen must show the correct records for the selected date range, keep pagination and totals consistent, and preserve the existing actions and permissions. A user must be able to find, open, update, assign, and recover records without a stale or misleading view.

## Date-filter contract

| Screen | Date meaning | Built-in ranges | Custom range | Server source |
| --- | --- | --- | --- | --- |
| All Leads / My Leads | Lead created date | All, today, yesterday, this week, this month, last month | Yes | `leads.created_at` in Asia/Karachi |
| Customers | Customer created date | All, today, yesterday, this week, this month, last month | Yes | `customers.created_at` in Asia/Karachi |
| Follow-ups | Follow-up due date | All, today, tomorrow, this week, this month, overdue | Yes | `follow_ups.due_at` / due date |
| Tasks / My Tasks | Task due date | All, today, yesterday, this week, this month, last month | Yes | `tasks.due_at` in Asia/Karachi |
| Users / Agents | User creation date | All, today, yesterday, this week, this month, last month | Yes | `users.created_at` in Asia/Karachi |
| Reports / Dashboard | Existing report range | Existing report controls | Existing | Existing report date bounds |

The date filter is intentionally not added to Add Lead, My Account, Settings, or Team Chat because those screens are forms or conversations rather than date-indexed record registries.

## Goal-based QA scenarios

### 1. Data discovery and filtering

- Confirm the default view is `All dates` and returns the same permitted scope as before.
- Select Today, Yesterday, This week, This month, and Last month; verify every visible row falls inside the selected CRM-timezone range.
- Select Custom range with start and end dates; verify the result includes both boundary dates.
- Enter a reversed custom range; verify it is normalized rather than producing an impossible empty result.
- Choose a custom range without both dates; verify no request is sent until Apply is pressed.
- Combine date with search, status, source, interest, priority, assignee, and assignment filters.
- Reset filters; verify date, search, status, and ownership filters all return to their defaults.

### 2. Pagination and counts

- Verify filtered totals, page counts, and empty states match the server response.
- Move forward and backward through filtered pages; verify the date range remains selected.
- Change a filter while a request is in flight; verify an older response cannot replace the newer result.

### 3. Record actions

- Open a lead/customer/follow-up/task from a filtered result and close it without losing the selected range.
- Open a user/agent from a filtered result and close it without losing the selected range; verify the visible user totals match the selected creation-date range.
- Edit a record, add a note, change status, complete/reschedule a follow-up, and complete/reopen a task; verify the list refreshes with the same date range.
- Assign one lead and bulk-assign multiple leads; verify ownership and My Leads scope update.
- Export Customers while filtered; verify the export uses the same date bounds.

### 4. Access and failure handling

- Test Super Admin, Sales Manager, Sales Agent, HR, and Project Manager permissions for each allowed screen.
- Confirm an out-of-scope record cannot be opened by a restricted user.
- Simulate a failed list request; verify a clear retry action appears and no stale success message is shown.
- Verify terminal opportunities do not appear in active Follow-ups and closed follow-ups remain historical.

## Automated checks

- JavaScript syntax checks cover the backend, active app shell, date helper, and all four list modules.
- Unit tests cover CRM timezone bounds, custom-range normalization, and malformed custom input.
- Production QA must still verify the live API response, browser controls, and role-specific actions after deployment.

## Current execution result

- `npm run check`: passed; all changed JavaScript files parse successfully.
- Date-filter unit and contract checks: 138/138 passed, including CRM timezone bounds, custom-range normalization, malformed custom input, all operational registries, and both relational/fallback server paths.
- Mock-system QA: 112 passed, 0 failed, 0 blocked across Sales Manager and Sales Agent workflows, permissions, lead/customer/follow-up lifecycle, search, assignment, reports, tasks, imports, notifications, chat, account controls, and logout.
- Affected PostgreSQL functional checks: 7/7 passed, including auto-linked customers, atomic reminder creation, retry idempotency, and closure propagation.
- Full repository suite: 261 passed, 3 skipped, 0 failed under the unrestricted local test runner. The earlier restricted-runner failures were environment-only localhost port errors.

## Live deployment verification

- Read-only check on 2026-11-21: `https://crm.aureummall.info/api/health/ready` returned HTTP 200 with `status: ready` and `database: connected`.
- The live CRM homepage returned HTTP 200 but did not reference `frontend/shared/date-filter.js` or the date-filter asset. This proves the live service is healthy but is still running the previous release; the new date-filter build has not been deployed.
- No production records, database schema, or hosting configuration were changed by this feature. Deployment and live-browser sign-off remain the final release gate.
