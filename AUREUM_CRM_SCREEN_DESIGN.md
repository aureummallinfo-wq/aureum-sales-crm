# Aureum Sales CRM — Screen-by-Screen Design

This document translates the Google Stitch prototype into the local Aureum Sales CRM experience. The implemented prototype is a buildless responsive SPA in `frontend/index.html`, `frontend/aureum-design-system.css`, and the layered frontend runtime files, backed by the dependency-free local API in `backend/crm-api-server.js`.

## Design language

- **Mood:** premium real-estate sales command center; calm, warm, precise, and operational.
- **Palette:** warm cream page background, dark charcoal navigation, champagne gold actions, white paper cards, muted brown copy.
- **Type:** Playfair Display for brand and display headings; DM Sans for UI, tables, filters, and helper text.
- **Shape:** soft 18px cards, 10–12px controls, thin warm borders, restrained shadows.
- **Interaction:** left navigation keeps the workspace stable; drawers expose detail without losing list context; toast feedback confirms lightweight actions.

## Shared shell

All authenticated screens use the same `AppShell` structure:

1. Fixed dark sidebar with Aureum mark, workspace navigation, and secure-workspace indicator.
2. Sticky topbar with breadcrumbs, CRM search, live-sync status, notifications, and user avatar.
3. Warm cream page canvas with a page header, responsive cards, tables, and drawers.

## 1. Login

- Split layout: brand story and performance proof on the left; secure sign-in card on the right.
- Brand panel uses dark brown/charcoal, gold rings, and a luxury positioning statement.
- Form includes work email/phone, password, remember terminal, forgot key, and login action.
- Local prototype uses a session-backed demo login and redirects into the role-aware dashboard.

## 2. Dashboard

- Role-filtered greeting with quick actions appropriate to the current user.
- Personal KPI labels and data for Sales Agents; team/company data for managers and Super Admin.
- Lead inflow, source distribution, follow-up performance, conversion overview, recent leads, and today’s follow-ups are loaded from dashboard APIs.
- Agent performance is visible only to Super Admin and Sales Manager.

## 3. All Leads

- Pipeline status tabs across the top.
- Search, status, source, and reset filters loaded against the permitted lead scope.
- Dense registry table with contact, interest, budget, advisor, status, next follow-up, and open action.
- Lead rows open a right-side detail drawer with status updates, notes, activity history, and customer handoff.

## 4. My Leads

- Same registry component as All Leads, filtered to the current advisor scope.
- Keeps the quick-action layout familiar while reducing role-specific noise.

## 5. Add New Lead

- API-backed intake form divided into Customer Information, Requirement Information, and CRM Routing.
- Captures contact details, interest, budget, source, ownership, status, financing, notes, and next follow-up date.
- Server validates manager/admin permission before creating the lead.

## 6. Customers

- Customer KPI strip for active profiles, high-intent accounts, due actions, and permitted scope.
- Search/filter bar and relationship table loaded from the customer API.
- Customer rows open a right-side profile drawer with Overview, Timeline, Notes, and Follow-ups tabs.
- Notes and customer-level follow-ups can be created from the drawer; role scope is enforced by the server.

## 7. Follow-ups

- Summary cards cover Today, Overdue, Upcoming, Completed, Missed, and Total.
- Date filters cover All dates, Today, Tomorrow, This week, This month, Overdue, and a custom start/end range.
- Status tabs cover All, Pending, Completed, Overdue, Missed, Rescheduled, and Cancelled.
- Table columns include customer/phone, type, advisor, lead status, due date/time, priority, status, and actions.
- Follow-up detail drawer exposes activity history, customer contact, mark done, reschedule, add note, call/WhatsApp, and customer-profile actions.
- Schedule form captures customer, type, priority, due date/time, and notes.
- Completion and rescheduling update the follow-up activity history and linked customer timeline.
- Status badges use gold for pending, red for overdue/missed, and green for completed.

## 8. Team Chat

- Three-column desktop layout: channel list, conversation, channel details.
- Internal-only channels: General, Sales Team, Announcements, Follow-ups, Bookings, Management.
- Direct advisor list includes online/offline indicator.
- Messages use compact paper/gold bubbles with clear author and time metadata.
- Channel visibility is role-scoped: Management is available only to Super Admin and Sales Manager.
- Channel and direct-message conversations are API-backed; the local preview refreshes the active conversation every five seconds.
- Compose supports text plus attachment metadata so the attachment interaction is available without requiring a multipart dependency in the preview.
- Mobile collapses to the conversation area for readability.

## 9. Agent-wise Reports

- Timeframe and advisor filters.
- KPI strip for advisors, assigned leads, completed touches, and closed deals.
- Closed deals ranking, conversion benchmark, and performance matrix.
- Report data is restricted to Super Admin and Sales Manager scopes and is calculated from permitted leads, follow-ups, and users.
- Agent rows open an advisor dossier drawer with overview, leads, follow-ups, customers, and activity tabs.
- Export actions are available for PDF/Excel entry points; the local preview returns role-scoped CSV-compatible export data while the production exporter can be swapped in later.

## 10. Agents

- People and permissions heading with add-agent action.
- KPI strip for active advisors, active leads, due follow-ups, and team conversion.
- Advisor table with team, role, assignment, closed deals, due follow-ups, and status.
- Add, edit, status, team, and detail actions are API-backed and preserve team scope.
- Super Admin can create Sales Managers and Sales Agents; Sales Manager can create Sales Agents in the manager's team.
- Add-agent drawer is intentionally constrained to Sales Manager and Sales Agent roles.

## 11. Settings

- Company identity and timezone controls.
- Role/permission summary for Super Admin, Sales Manager, and Sales Agent.
- Lead status/tag and notification preferences.
- Settings action uses the same gold confirmation pattern as other workspace changes.

## Responsive behavior

- Desktop: full sidebar and multi-column dashboard.
- Tablet: compact icon-only sidebar and two-column content where useful.
- Mobile: single-column cards, horizontally scrollable data tables, collapsed chat sidebars, and full-width drawers.

## Prototype scope

The local implementation is a buildless responsive SPA backed by a dependency-free Node server. Authentication, role-aware route access, role-filtered dashboard data, live leads/customers/follow-ups, Team Chat, Reports, Agents management, detail drawers, notes, timelines, state changes, and shared UI foundation primitives are implemented with in-memory demo data. Team Chat uses polling in this dependency-free preview; a WebSocket transport and persistent file storage/database should replace the in-memory maps before production use. See `FOUNDATION_GOAL_IMPLEMENTATION.md` and `GOALS_6_8_IMPLEMENTATION_STATUS.md` for the implementation mapping.
