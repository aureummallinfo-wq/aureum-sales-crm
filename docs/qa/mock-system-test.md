# Sales Manager and Sales Agent mock test

Run `npm run test:mock` from the repository root. The runner creates its own disposable HTTP server and PostgreSQL-compatible PGlite database. It forces `DATABASE_URL` empty and persistence off for the HTTP fixture; it does not read `.env.local` or accept a production URL. Fixture passwords are for local mock accounts only.

Open `output/mock-system-test-report.html` for an easy report. Filter by portal, result or module. Markdown and JSON versions are saved alongside it. Each row names the real assertions performed. A failed or blocked case makes the command exit with code 1. Rerunning starts with fresh data; it replaces the generated reports.

## Coverage

Both portals: login/session, presence, seven dashboard widgets and date ranges, personal/team lead scope, create/search/edit/status/notes, create customer with an optional reminder, customer tabs and custom property types, tags, reschedule/add note, duplicate reminder prevention, global search, notifications, channel/direct chat, attachments/links, profile/preferences/password validation, logout and permission boundaries.

Manager: lead reassignment across linked records, group management, six report views and five CSV exports, advisor creation/onboarding/status/audit, team restrictions and denied administrator creation.

Agent: denied management actions, private channels, another agent's records, lead reassignment and task creation/deletion/reassignment.

Database checks: real relational API and SQL repository for task creation, validation, assignment, scope, completion/reopening, filtering, reassignment and deletion; manager/agent lead imports, duplicates, invalid contacts, ownership and a generated Excel workbook preview.

## Browser acceptance steps

Use a disposable development workspace for these checks. Do not change live customer records for a mock test.

| Screen | Sales Manager | Sales Agent | Expected result |
|---|---|---|---|
| Login | Sign in, refresh, sign out | Same | Refresh retains the session; sign out returns to login |
| Dashboard | Team totals and agent performance | Personal totals | Changing dates updates charts within the correct scope |
| All Leads / My Leads | Open, search, filter and reassign team records | Open and filter only own records | Other agents' records stay inaccessible |
| Add Lead | Create and choose an advisor | Create for own account | Required fields validate; compact Tags supports multiple choices |
| Lead drawer | Edit/status/notes/activity/create customer | Same for own lead | Creating a customer prefills lead details |
| Customer creation | Choose optional follow-up, note/date/time/tag | Same | One linked profile and one pending reminder; no false contact stamp |
| Customers | Search/open/edit tabs and tags | Own customers | Property type Other reveals a required text box and retains custom text |
| Follow-ups | Team list/filter/calendar/schedule | Own list/filter/calendar/schedule | Full table; Actions only Reschedule and Add note; Last activity only date/time |
| Follow-up reschedule | Save note, future date/time and tag | Same | Contacted until due; same reminder ID; history retained |
| Follow-up add note | Save an internal note | Same | Due date/time, status and last-contact time remain unchanged |
| Tasks | Create/edit/assign/delete | Complete/reopen assigned task | Reassignment removes the previous agent's access |
| Team Chat | Channel/direct/group messages and assets | Permitted channel/direct/group messages | No private channel leaks; agent cannot create/manage groups |
| Reports | Date/agent filters, details, CSV export | Screen absent and direct route blocked | Team scope preserved in report and exported rows |
| Users | Create/edit/onboard/suspend team advisor | Screen absent and direct route blocked | No privilege escalation or management outside the team |
| My Account | Profile, preferences, activity | Same | Invalid submissions preserve saved values; password rules apply |
| Navigation | Open every permitted menu and browser back/refresh | Same | No blank/error screen or stale data after switching accounts |

Tasks work in both the local in-memory/JSON backend and the database backend, with shared HTTP validation and permissions. Lead Import browser checks need a database-backed development server; its actual relational API/SQL logic is exercised separately.

Real email delivery, telephone/WhatsApp, external services, hosted Neon connectivity, performance, accessibility, and the full device/browser matrix require separate checks. `npm run check` and `npm test` remain the broader regression suite; `npm run test:crm` is the explicitly database-backed readiness run.
