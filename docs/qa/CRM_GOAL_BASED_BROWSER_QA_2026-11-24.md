# Aureum Sales CRM — Goal-Based Browser QA

**Execution date:** 24 November 2026 (Asia/Karachi)  
**Environment:** authenticated production browser session  
**URL:** https://crm.aureummall.info/dashboard  
**Role:** Waqas — Super Admin  
**Viewport observed:** approximately 1265 × 710 desktop browser viewport  
**Coverage:** live navigation, accessibility tree inspection, screenshots, section-level visual review, control discovery, filter/menu state inspection, empty-state behavior, and cross-screen consistency.

## 1. QA objective

This is a goal-based QA review rather than a simple visual check. Each screen was evaluated against the job the user is trying to complete:

| Goal | QA question |
|---|---|
| G1 — Orient quickly | Can a user understand where they are, what the page is for, and what the next action is? |
| G2 — Read the business state | Are totals, statuses, alerts, charts, tables, and empty states visible and understandable? |
| G3 — Navigate safely | Do the sidebar, breadcrumb, global search, account, notifications, and quick actions expose clear destinations? |
| G4 — Narrow the work | Do tabs, search, filters, date controls, reset controls, and pagination form a coherent workflow? |
| G5 — Execute CRM work | Can a user add, assign, follow up, update, report on, and manage records without ambiguity? |
| G6 — Preserve scope and trust | Is the visible data scope, ownership, role context, and technical state understandable? |
| G7 — Maintain visual quality | Are the light theme, spacing, grids, typography, action groups, tables, and empty states aligned? |
| G8 — Remain reliable | Do screens load consistently, preserve controls, and avoid transient data/empty-state contradictions? |

### Result legend

- **PASS** — behavior and visual result were satisfactory in the browser pass.
- **PARTIAL** — usable, but a visual, content, or interaction risk remains.
- **FAIL** — a user-facing defect was observed.
- **NOT EXECUTED** — outside this browser run, so it must not be treated as passed.

## 2. Executive result

The CRM has a coherent light luxury theme: dark branded navigation, warm cream workspace, ivory cards, gold accents, consistent rounded controls, and readable serif display headings. The desktop shell is generally strong and the main navigation is discoverable.

The release is **usable for desktop QA**, but not yet ready to call fully signed off for UI quality. The most important issues are:

1. **P1 — Reports lacks the same page-header rhythm as the other modules.** It opens with a filters card rather than a consistent title/description/action block.
2. **P1 — Dashboard Agent Performance is not repeatable.** During the run it showed a complete advisor list in one state, then later showed `Show All users (0)` and `No users match this filter` after returning to the dashboard.
3. **P1 — Desktop action alignment had a wrapping defect on All Leads.** The local CSS alignment patch now addresses the header layout, but it is not deployed or production-verified.
4. **P1 — Customers had an unbalanced six-card grid.** The local CSS patch changes it to a balanced 3 × 2 desktop arrangement, but production verification is still required.
5. **P2 — Users exposes the technical team value `team_a` instead of the user-facing label `Sales Team A`.
6. **P2 — Mobile and tablet breakpoints were not executed in the browser.** Desktop visual quality cannot be used as evidence of responsive pass.

## 3. Screen-by-screen QA

### 3.1 Shared application shell

**Observed sections:** sidebar, breadcrumb/top bar, global search, notifications, account menu, main workspace.

**Observed navigation:** Dashboard, All Leads, My Leads, Meta Intake, Add New Lead, Customers, Follow-ups, Tasks, Reports, Users, My Account, Settings, Sign out.

| Goal | Result | Evidence / notes |
|---|---|---|
| G1 | PASS | Active page title is reflected in the breadcrumb and main heading on most modules. |
| G2 | PASS | Sidebar badges expose `1 new leads today` and `2 overdue follow-ups`. |
| G3 | PASS | All primary modules are visible in one persistent navigation rail. |
| G6 | PASS | Account menu identifies `Waqas`, `Super Admin`, and `waqas@aureum.com`. |
| G7 | PASS | Theme tokens are consistent across screens. |
| G8 | PARTIAL | Dashboard advisor data was not repeatable after navigation; see BUG-004. |

**Global notifications control:** opens a readable panel with `All caught up`, `Mark all read`, `Enable desktop alerts`, a filter for All notifications / Follow-ups / Unread, and a clear empty state. This is a good empty-state pattern. No notification mutation was performed.

**Account control:** opens presence state (`Online`, `Away`, `Offline`), identifies the current user, and exposes My Account and Change Password. This is functionally discoverable. Presence remained Offline during the run; no status mutation was performed.

**Global search:** present in the top bar on all inspected routes. Search execution and result navigation were not fully exercised because this run avoided entering live customer data into a global search.

### 3.2 Dashboard

**Route:** `/dashboard`  
**Purpose:** orient the team, assess current pipeline, and move to the next action.

| Section | Status | Detailed QA result |
|---|---|---|
| Welcome and range controls | PASS | `Welcome back, Waqas`, Refresh dashboard, and This Month range are visible. Range menu exposes Today, This Week, This Month, Last Month, Custom Range. |
| KPI strip | PASS | Eight KPI cards are visible: Total Leads 518, New Leads 185, Hot Leads 0, Follow-ups Due 111, Overdue Follow-ups 2, Active Customers 202, Closed Deals 4, Conversion Rate 0.8%. Cards are actionable buttons. |
| Lead Inflow Trend | PASS | Chart exposes accessible daily values for Nov 1–30. The browser tree contained values such as Nov 1 = 138 and Nov 24 = 41. |
| Lead Sources | PARTIAL | Manual Entry is shown as 100% of 518 visible leads. This is readable, but the concentration should be verified against actual source data because it can also indicate incomplete source ingestion. |
| Follow-up Performance | PASS | Pending 23, Contacted 86, Completed 0, Overdue 2, Missed 0, Rescheduled 2, Cancelled 0 are exposed with percentages. |
| Agent Performance | FAIL / P1 | One inspected state exposed 16 advisors with team and presence data; after returning to Dashboard, the same section exposed `Show All users (0)` and `No users match this filter`. This is a reliability/repeatability defect until the data-loading condition is understood. |
| Conversion Overview | PASS | New 185, Contacted 12, Follow-up 7, Visit Scheduled 0, Visit Completed 0, Negotiation 0, Closed Won 4. |
| Quick Actions | PASS | Add New Lead, View All Leads, View Reports, Manage Users, View Follow-ups are visible and clear. |
| Recent Leads | PARTIAL | The section has agent filter, range context, View all, and an empty state. In an earlier state it displayed a six-row table; after returning it showed `No recent leads found`, so dynamic repeatability should be investigated. |
| This Month Follow-ups | PARTIAL | Period control and empty state are present. Earlier state showed six rows and two overdue items; later state showed no follow-ups. See BUG-004. |

**Desktop visual assessment:** PASS overall. The dashboard reads as a polished command center. The main remaining risk is not color or typography; it is data-state consistency after navigation and refresh.

### 3.3 All Leads

**Route:** `/all-leads`  
**Purpose:** search, filter, inspect, import, export, and update the full lead registry.

| Section | Status | Detailed QA result |
|---|---|---|
| Page heading and actions | PARTIAL / P1 | Heading, Download CSV template, Import CSV / Excel, Refresh, and Add new lead are discoverable. At the observed desktop width, Add new lead wrapped awkwardly in the action area. The local CSS alignment patch keeps desktop header actions on one aligned row; deployment verification remains open. |
| Summary cards | PASS | Matching leads, Hot, Follow-up, and Scheduled cards form a clear scan strip. |
| Status tabs | PASS | All Leads, New, Contacted, Qualified, Hot, Warm, Cold, Follow-up, Visit Scheduled, Visit Completed, Meeting Scheduled, and More are available. |
| Search and filters | PASS | Search leads, assignment scope, agent, source, interest, priority, and date controls are present, plus Reset. |
| Registry table | PASS | Table exposes lead, phone/WhatsApp, interest, location, budget, status/priority, and actions. |
| Empty/loading state | PASS | The no-match state explains the condition and offers Reset filters. |
| Pagination | PASS | Rows per page 10/25/50/100, first/previous/next/last, and go-to-page controls are exposed. |
| Record actions/drawer | PARTIAL | Table action affordances were identified, but a full record edit/follow-up mutation was intentionally not executed against live data. |

### 3.4 My Leads

**Route:** `/my-leads`  
**Purpose:** work the assigned personal/team-scope queue.

| Section | Status | Detailed QA result |
|---|---|---|
| Page identity | PASS | Heading explains that this is the assigned relationship scope. `PERSONAL SCOPE` is visible. |
| Header actions | PASS | Download CSV template, Import CSV / Excel, and Refresh align cleanly in the inspected viewport. |
| Summary cards | PASS | Matching assigned records, Hot on this page, Follow-up on this page, and Scheduled on this page are clear. |
| Personal status tabs | PASS | All through Meeting Scheduled plus More are present. |
| Filters | PASS | Search leads, source, interest, priority, date, and Reset are present. |
| Empty state | PASS | `No leads match these filters` plus `Try clearing a filter or search another customer` is understandable. |
| Pagination | PASS | Zero-result state disables navigation correctly. |
| Visual layout | PASS | Screenshot showed balanced cards, aligned controls, readable table headers, and no white-theme mismatch. |

**Note:** The current Super Admin account had zero assigned records in this scope. That is a valid data state, not itself a UI defect.

### 3.5 Add New Lead

**Route:** `/add-lead`  
**Purpose:** capture a complete inquiry once and establish ownership/next action.

| Section | Status | Detailed QA result |
|---|---|---|
| Page heading and cancel | PASS | Clear title, explanatory copy, and Cancel action. |
| 01 — Customer information | PASS | Full name and phone are clearly required; WhatsApp, email, city, area/locality, and preferred contact method are present. |
| 02 — Requirement information | PASS | Interested in is required; budget, preferred location, and purpose are present. Options are exposed in accessible menus. |
| 03 — CRM information | PASS | Lead source, priority, initial status, assigned agent, next follow-up, status tags, and internal notes are available. |
| Ownership and routing | PASS | Assigned agent includes Assign later and named agents. Status options cover the pipeline from New through Closed Won, Closed Lost, No Response, Not Interested, and Invalid. |
| Form actions | PASS | Cancel, Save & add another, and Save lead are all visible. |
| Visual layout | PASS | Screenshot showed a balanced two-column form on desktop with section cards and clear grouping. |
| Validation behavior | NOT EXECUTED | No live record was submitted. Required-field validation and server-side duplicate handling need a controlled test record in a non-production or approved QA dataset. |

### 3.6 Customers

**Route:** `/customers`  
**Purpose:** manage converted and active relationships.

| Section | Status | Detailed QA result |
|---|---|---|
| Summary metrics | PARTIAL / P1 | Six metrics were previously rendered as an uneven 4 + 2 layout with a large blank area. The local CSS patch changes the desktop grid to balanced 3 × 2. Production browser verification is still required. |
| Status tabs | PASS | Broad lifecycle coverage is present, including Negotiation, Booking, Closed Won, Closed Lost, No Response, Not Interested, and Invalid. |
| Filters | PASS | Source, city, interest, priority, agent, date, and reset controls are available. |
| Customer registry | PASS | Table and pagination structure are present and consistent with the lead registry. |
| Empty and no-match behavior | PASS | The application uses consistent reset/filter guidance. |

### 3.7 Follow-ups

**Route:** `/follow-ups`  
**Purpose:** prioritize scheduled client touchpoints and overdue work.

| Section | Status | Detailed QA result |
|---|---|---|
| Summary cards | PASS | Matching follow-ups 123, Today 3, Overdue 2, Upcoming 22, Completed 0, Missed 0 were exposed. Six cards form a balanced 3 × 2 composition. |
| Performance card | PASS | Completion 0%, Overdue 8%, Missed 0%, Reschedule 72%, High-priority 0%, Same-day 0% are visible. |
| Status tabs | PASS | All, Pending, Contacted, Completed, Overdue, Missed, Rescheduled, Cancelled. |
| Filters | PASS | Date, agent, type, priority, lead status, and reset controls are available. |
| Work table | PASS | Table and pagination are available for operational follow-up work. |
| Visual layout | PASS | Strongest module for balanced cards and clear action priority in the inspected desktop view. |

### 3.8 Tasks

**Route:** `/tasks`  
**Purpose:** assign and monitor internal work.

| Section | Status | Detailed QA result |
|---|---|---|
| Page heading and assignment action | PASS | `Task assignment` and `Assign task` are clear. |
| KPI strip | PASS | Four task metrics are aligned and readable. |
| Filters | PASS | Search, status, priority, assignee, and date are available. |
| Empty state | PASS | `No tasks yet` is explicit and paired with the assignment action. |
| Pagination | PASS | Present and appropriately inactive when empty. |
| Visual layout | PASS | Consistent with the light theme and other registry modules. |

### 3.9 Reports

**Route:** `/reports`  
**Purpose:** turn CRM activity into management decisions.

| Section | Status | Detailed QA result |
|---|---|---|
| Filter block | PASS | Date range, team, agent, lead status, lead source, follow-up status, generated date/currency, and clear filters are available. |
| Page identity/rhythm | PARTIAL / P1 | Unlike the other modules, Reports begins with a filters card and does not present the same title/description/action header rhythm. This makes the module feel visually detached from the rest of the app. |
| KPI summary | PASS | Total agents, assigned leads, contacted leads, hot leads, follow-ups completed, overdue follow-ups, and closed deals are surfaced. |
| Agent-wise performance | PARTIAL | Primary report table is useful, but it horizontally scrolls/clips at the observed desktop viewport. Table density and sticky-column behavior should be verified. |
| Detailed reports | PASS | Lead report, Customer report, and Follow-up report sections are present. |
| Visual theme | PASS | Colors and card treatment match the shared theme. |

### 3.10 Users

**Route:** `/users`  
**Purpose:** manage users, teams, roles, and operational capacity.

| Section | Status | Detailed QA result |
|---|---|---|
| KPI strip | PASS | Four user metrics align cleanly. |
| Search and filters | PASS | Search, role, status, date, and Refresh controls are available. |
| User table | PARTIAL / P2 | Columns cover User, Team, Role, Assigned leads, Active leads, Closed, Follow-ups due, Status, and Action. The Team value renders as raw `team_a` instead of the user-facing `Sales Team A`. |
| Status visibility | PASS | Active/inactive state is visible and understandable. |
| Theme/layout | PASS | Consistent desktop light-theme layout. |

### 3.11 My Account

**Route:** `/my-account`  
**Purpose:** manage personal profile, notifications, appearance, and display preferences.

| Section | Status | Detailed QA result |
|---|---|---|
| Personal settings navigation | PASS | Profile, Notifications, Appearance, and Display are easy to locate. |
| Profile | PASS | Profile card