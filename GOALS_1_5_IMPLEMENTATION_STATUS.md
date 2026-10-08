# Aureum Sales CRM — Goals 1–5 Implementation Status

## Current state

Goals 1–5 are implemented as a working local prototype using the Aureum Stitch-inspired design system and a dependency-free Node API.

## Goal coverage

| Goal | Status | Main implementation |
|---|---|---|
| Authentication & RBAC | Complete | Session login/logout, current user, protected routes, role sidebar, API authorization |
| Dashboard | Complete | Role-filtered KPIs, charts, recent leads, today’s follow-ups, agent comparison hidden from Sales Agents |
| Leads | Complete | Live All Leads/My Leads tables, filters, lead drawer, notes, status changes, activity history, Add New Lead |
| Customers | Complete | Scoped customer table, profile drawer, Overview/Timeline/Notes/Follow-ups tabs, notes and follow-up creation |
| Follow-ups | Complete | Scoped list, metrics, status/date/custom range filters, detail drawer, schedule, done, reschedule, missed, notes |

## Role behavior

- Super Admin sees company-wide data and all workspace screens.
- Sales Manager sees team data and can create/manage team leads and follow-ups, but cannot access Settings.
- Sales Agent sees only assigned leads, customers, and follow-ups; company-wide APIs and agent comparison data return `403`.

## Cross-module activity

Follow-up schedule, completion, reschedule, missed, cancelled, and note events are written to the follow-up activity history and linked customer/lead timelines. Dashboard summary data is derived from the permitted scope.

## Local run

```powershell
npm start
```

Open `http://127.0.0.1:4173/`.

## Demo accounts

All demo accounts use `Aureum123!`:

| Email | Role |
|---|---|
| `admin@aureum.com` | Super Admin |
| `manager@aureum.com` | Sales Manager |
| `advisor@aureum.com` | Sales Agent |

## Production handoff

The current server uses in-memory demo records and sessions. Before production, replace these maps with persistent users, teams, sessions, leads, customers, follow-ups, notes, tags, and activity tables; add migrations, validation, persistent audit logs, and a scheduled overdue job.
