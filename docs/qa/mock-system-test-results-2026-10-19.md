# Mock system test results — 19 October 2026

Scope: Sales Manager and Sales Agent portals, using disposable local records and a separate PostgreSQL-compatible PGlite database. Production and hosted Neon were not exercised.

| Test layer | Passed | Failed | Blocked / skipped |
|---|---:|---:|---:|
| Repeatable mock API and database checks | 105 | 4 | 0 |
| Actual browser checks | 24 | 4 | 2 |
| Existing regression suite (latest workspace run) | 131 | 0 | 1 hosted Neon readiness check skipped |

The four automated failures are two defects repeated for both roles. The four browser failures are refresh/session loss for both roles plus two manager form defects. A green existing regression suite does not cover these new failures.

## Findings

| ID | Priority | Affected area | Reproduction and observed result | Scope |
|---|---|---|---|---|
| MOCK-01 | High | Refresh/session | Sign in, open My Account or Change Password, refresh. Both roles return to the login form. | Local browser; shared frontend. Duplicate boot calls are a suspected cause; deployment not tested. |
| MOCK-02 | High | Manager Add New Lead | Open All Leads, then Add New Lead. Assigned agent shows only Assign later, although the lead drawer lists active advisors. A created lead must be assigned afterward. | Browser; shared frontend. The form initially renders a placeholder and relies on a later population call. |
| MOCK-03 | High | Customer edit | Create a customer from a lead whose Interested in is Commercial. Edit only Property type and save. Commercial is absent from the customer interest dropdown, so the saved interest becomes blank. | Browser; shared frontend. Data loss on an unrelated edit. |
| MOCK-04 | Medium | Profile validation | PATCH an empty fullName and invalid phone. Server returns 422, but the following GET contains the rejected values. | In-memory backend only. The relational API/PGlite preservation checks pass for both roles. |
| MOCK-05 | Medium | Logout | Sign out, then replay the retained old session cookie. Local backend still returns 200. The browser cookie itself is expired correctly. | In-memory backend only. Real database session revocation checks pass for both roles. |
| MOCK-06 | Coverage gap | Tasks browser | Open Tasks in the local memory server. Both portals show Unable to load tasks / API route not found. | Local backend has no Tasks handlers. Actual relational API/repository checks pass for create, assign, validation, scope, complete/reopen, filter, reassign and delete. |

## Confirmed workflows

- Both roles can create, find, edit and annotate permitted leads and customers. Agent ownership is enforced; management permissions are denied to agents.
- Manager assignment moves the lead, linked customer and reminder together.
- Customer creation from a lead copies details, saves an optional note/date/time/tag, creates one pending reminder and does not mark the client contacted.
- Repeated scheduling reuses the same reminder. Reschedule saves the exact date/time/tag and shows Contacted. Add note preserves the contact schedule and status.
- The browser follow-up table retains all columns, only Reschedule and Add note in Actions, and only a date/time in Last activity.
- Compact Tags supports multiple selections. Customer Property type Other reveals a text field and saves custom text.
- Channel/direct/group chat, test attachments, shared links, notifications, report reads/CSV exports, advisor onboarding/status/audit and task/import database logic pass the exercised checks.

## Re-run and evidence

Run `npm run test:mock`. It exits with code 1 while failures remain. See `docs/qa/mock-system-test.md` for coverage and browser acceptance steps.

Generated local artifacts:

- `output/mock-system-test-report.html` — filterable API/database report
- `output/mock-system-test-report.md` and `output/mock-system-test-results.json`
- `output/mock-browser-results-2026-10-19.json` — individual browser checks
- `output/mock-manager-followup.png` and `output/mock-agent-refresh-failure.png`

This run checks the main flows of every permitted portal area. It does not certify every control, device, browser, live email/call/WhatsApp service, external integration, load or accessibility behavior. No application fixes were included in this testing change.
