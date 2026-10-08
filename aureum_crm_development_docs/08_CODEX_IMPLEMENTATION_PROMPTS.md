# 08 — Codex Implementation Prompts

Use these prompts step by step in Codex or another coding assistant.

---

## Prompt 1 — Project Setup
Create a modern web app for Aureum Sales CRM. Implement a clean folder structure, authentication-ready routing, reusable UI components, and environment variable support. Use the Aureum CRM design system with warm cream backgrounds, champagne gold accents, dark sidebar, rounded cards, and professional table components.

Do not implement unrelated modules such as projects, properties, units, visits, meetings, or tasks.

---

## Prompt 2 — Role-Based Auth and Route Guard
Implement authentication state and role-based route protection for three roles only: SUPER_ADMIN, SALES_MANAGER, SALES_AGENT.

Routes:
- /dashboard: all roles
- /leads/all: SUPER_ADMIN, SALES_MANAGER
- /leads/my: all roles
- /leads/new: SALES_MANAGER only
- /customers: all roles
- /follow-ups: all roles
- /team-chat: all roles
- /reports: SUPER_ADMIN, SALES_MANAGER
- /agents: SUPER_ADMIN, SALES_MANAGER
- /settings: SUPER_ADMIN only

Sales Agent must not access All Leads, Add New Lead, Reports, Agents, or Settings even by direct URL.

---

## Prompt 3 — Layout and Sidebar
Build the authenticated AppShell with left sidebar, topbar, and main content area.

Sidebar must change by role:

SUPER_ADMIN:
Dashboard, All Leads, My Leads, Customers, Follow-ups, Team Chat, Reports, Agents, Settings

SALES_MANAGER:
Dashboard, All Leads, My Leads, Add New Lead, Customers, Follow-ups, Team Chat, Reports, Agents

SALES_AGENT:
Dashboard, My Leads, Customers, Follow-ups, Team Chat

Use Aureum luxury real-estate styling: dark sidebar, champagne gold active state, warm cream page background.

---

## Prompt 4 — Reusable Components
Create reusable components:
- KpiCard
- DataTable
- StatusBadge
- PriorityBadge
- FilterBar
- RightDrawer
- PageHeader
- SearchInput
- PrimaryButton
- SecondaryButton
- EmptyState
- LoadingState

All components must follow the Aureum CRM design system.

---

## Prompt 5 — Database Models
Implement the database schema for:
- users
- teams
- leads
- customers
- follow_ups
- notes
- activity_logs
- chat_channels
- chat_members
- chat_messages
- settings

Add role fields, timestamps, assignment relationships, and indexes for status, assigned agent, and due dates.

---

## Prompt 6 — Leads Module
Build All Leads and My Leads screens.

All Leads access:
- Super Admin
- Sales Manager

My Leads access:
- All roles

Sales Agent must see only assigned leads.

Include filters, status tabs, search, table columns, and actions based on role permissions.

---

## Prompt 7 — Add New Lead Screen
Build Add New Lead screen for Sales Manager only.

Fields:
- Full Name
- Phone Number
- WhatsApp Number
- Email
- City
- Area
- Preferred Contact Method
- Interested In
- Budget
- Property Type
- Preferred Location
- Purpose
- Buying Timeline
- Financing Requirement
- Lead Source
- Assigned Agent
- Lead Status
- Tags
- Next Follow-up Date
- Notes

Add Save Lead, Save & Add Another, and Cancel actions.

---

## Prompt 8 — Customers Module
Build Customers screen and Customer Detail Drawer.

Customers should be filtered by role:
- Super Admin: all customers
- Sales Manager: team/customers allowed by manager scope
- Sales Agent: assigned customers only

Customer Detail Drawer should open from the right side and include contact info, interest info, notes, timeline, follow-up history, and quick actions.

---

## Prompt 9 — Follow-ups Module
Build Follow-ups screen with role-based visibility.

Features:
- Summary cards
- Date filter
- Calendar filter
- Advanced filters
- Follow-up table
- Follow-up detail drawer
- Mark Done
- Reschedule
- Add Note

Super Admin sees all follow-ups. Sales Manager sees team follow-ups. Sales Agent sees own follow-ups only.

---

## Prompt 10 — Team Chat Module
Build internal Team Chat screen.

Include:
- Channels
- Direct messages
- Text messages
- File attachments
- Unread counts
- Online/offline status
- Message timestamps

Do not build customer chat, WhatsApp inbox, voice, video, or advanced social features.

---

## Prompt 11 — Reports Module
Build Agent-wise Reports screen for Super Admin and Sales Manager only.

Include:
- Date filters
- KPI cards
- Agent performance table
- Charts
- Agent Detail Drawer
- Export buttons

Sales Agent must not access this screen or API.

---

## Prompt 12 — Agents Management Module
Build Agents Management screen for Super Admin and Sales Manager only.

Include:
- Agent table
- Add Agent drawer
- Edit Agent drawer
- Agent Detail drawer
- Activate/deactivate controls

Allowed roles in Add Agent dropdown:
- Sales Manager
- Sales Agent

Do not add Admin role.

---

## Prompt 13 — Settings Module
Build Settings screen for Super Admin only.

Sections:
- Company Settings
- Role & Permission Settings
- Lead Status / Tags Settings
- Lead Source Settings
- Notification Settings
- CRM Preferences

Sales Manager and Sales Agent must not access Settings or settings APIs.

---

## Prompt 14 — QA and Security
Review the application for:
- Role-based screen visibility
- API permission enforcement
- Sales Agent data isolation
- Responsive layout
- Reusable components
- Consistent Aureum design system
- No removed Phase 1 modules

Fix any route or API that allows unauthorized role access.
