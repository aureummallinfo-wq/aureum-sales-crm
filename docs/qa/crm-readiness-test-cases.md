# CRM Readiness Test Cases

These cases verify that the CRM is usable as a database-backed application. The automated suite is read-only: it logs in with the seeded QA accounts and reads Neon-backed records without creating, editing, or deleting CRM data.

Run the automated readiness gate with:

```text
pnpm test:crm
```

## Automated cases

| ID | Area | Test case | Expected result |
| --- | --- | --- | --- |
| CRM-001 | Database | Start the API with `.env.local` and wait for initialization | Server confirms `connected to Neon PostgreSQL` |
| CRM-002 | Authentication | Request dashboard data without a session | API returns `401` |
| CRM-003 | Authentication | Sign in as Super Admin, Sales Manager, and Sales Agent | Each account receives a valid session and the correct role |
| CRM-004 | Session | Load `/api/auth/me` for each signed-in role | The returned role matches the account used to sign in |
| CRM-005 | Dashboard | Load dashboard summary for all roles | API returns the correct scope and database-derived summary fields |
| CRM-006 | Dashboard | Load lead inflow, lead sources, follow-up performance, conversion overview, recent leads, and today’s follow-ups | Every endpoint returns an array with the frontend contract expected by the charts and tables |
| CRM-007 | Dashboard | Load agent performance as Super Admin and Sales Manager | Both authorized roles receive agent rows with metrics |
| CRM-008 | Permissions | Load agent performance, all leads, reports, and settings as Sales Agent | Every restricted endpoint returns `403` |
| CRM-009 | Permissions | Load settings as Sales Manager | Admin-only settings return `403` |
| CRM-010 | Permissions | Load settings as Super Admin | Settings return `200` |
| CRM-011 | Data source | Inspect the dashboard frontend module | The removed `dashboardMock` dataset is absent |
| CRM-012 | Core reads | Load assigned leads, customers, and follow-ups for each role | Each endpoint returns a valid `data` array |

## Manual browser cases still recommended

| ID | Test case | Expected result |
| --- | --- | --- |
| CRM-013 | Refresh the deployed dashboard while signed in | No `.map is not a function` error; charts render or show an empty state |
| CRM-014 | Create a lead, refresh, and search for it | The record remains available after refresh and is returned by the API |
| CRM-015 | Edit a lead or customer, refresh, and reopen it | The changed values persist from Neon |
| CRM-016 | Add a follow-up, refresh, and check the dashboard | The follow-up appears in the correct list and metric |
| CRM-017 | Sign in as Sales Agent and try an unassigned lead URL | The record is not disclosed and the UI shows access denied |
| CRM-018 | Sign out, then use the browser back button | Protected data is not available without a valid session |
| CRM-019 | Open the app on phone and desktop widths | Navigation, forms, tables, and dashboard remain usable |
| CRM-020 | Submit invalid lead/customer data | Validation prevents the request or returns a clear error without a partial record |

The automated gate confirms API and data-contract readiness. The manual cases are the final user-journey and responsive checks before calling the CRM production-ready.
