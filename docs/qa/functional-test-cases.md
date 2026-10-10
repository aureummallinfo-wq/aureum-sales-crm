# Functional Test Cases

| Test Case ID | Module | Feature | Role | Precondition | Steps | Expected Result | Priority | Severity | Automation Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FT-001 | Auth | Login success | All | Active demo user exists | Submit valid credentials | User logs in and lands on dashboard | P0 | Critical | Functional |
| FT-002 | Auth | Login failure | All | Invalid credentials | Submit invalid login | Login fails with safe generic message | P0 | High | Functional |
| FT-003 | Auth | Logout | All | User logged in | Click logout | Session clears and protected APIs require auth | P0 | High | Functional |
| FT-004 | Auth | Inactive login blocked | Inactive user | Inactive account exists | Attempt login | Login blocked | P0 | Critical | Functional |
| FT-005 | Auth | Suspended login blocked | Suspended user | Suspended account exists | Attempt login | Login blocked | P0 | Critical | Functional |
| FT-006 | Auth | Temporary password onboarding | New user | Temporary password user exists | Login, try dashboard, change password | User is forced to change password before dashboard access | P0 | Critical | E2E |
| FT-007 | Dashboard | Super Admin dashboard | Super Admin | Logged in | Open dashboard | Company KPI cards, charts, leads, follow-ups, filters render | P1 | High | Functional |
| FT-008 | Dashboard | Manager dashboard | Sales Manager | Logged in | Open dashboard | Team-scoped dashboard data only | P1 | High | Functional |
| FT-009 | Dashboard | Agent dashboard | Sales Agent | Logged in | Open dashboard | Own leads, follow-ups, customers, metrics only | P1 | High | Functional |
| FT-010 | Leads | All Leads access | Leadership, Agent | Logged in | Open All Leads by role | Admin/manager allowed; agent denied | P0 | Critical | E2E |
| FT-011 | Leads | My Leads access | All | Logged in | Open My Leads | All roles allowed with scoped data | P0 | High | Functional |
| FT-012 | Leads | Add Lead access | Manager, Agent | Logged in | Submit add lead | Manager can add; agent cannot | P0 | High | E2E |
| FT-013 | Leads | Lead detail drawer | Permitted user | Lead exists | Open lead drawer | Overview, notes, activity, actions render | P1 | High | Functional |
| FT-014 | Leads | Lead status update | Permitted user | Lead exists | Change status | Status and activity update | P1 | High | Functional |
| FT-015 | Customers | Customer list scoping | All | Customers exist | Open customers by role | Admin all, manager team, agent own | P0 | Critical | Functional |
| FT-016 | Customers | Customer detail drawer | Permitted user | Customer exists | Open drawer and tabs | Drawer, tabs, notes, timeline render | P1 | High | Functional |
| FT-017 | Follow-ups | Create follow-up | Permitted user | Customer exists | Create follow-up | Follow-up is scheduled | P1 | High | Functional |
| FT-018 | Follow-ups | Reschedule follow-up | Permitted user | Follow-up exists | Reschedule date/time | History updates and status changes | P1 | High | Functional |
| FT-019 | Follow-ups | Mark follow-up done | Permitted user | Follow-up exists | Complete with note | Status becomes Completed and note saved | P1 | High | Functional |
| FT-020 | Team Chat | Channels | All | Logged in | Open chat | Channels, groups, DMs, input, info panel work; agent cannot see management channel | P1 | High | E2E |
| FT-021 | Team Chat | Group permissions | All | Logged in | Create group by role | Admin/manager can create within scope; agent denied | P0 | High | E2E |
| FT-022 | Reports | Reports access | Leadership, Agent | Logged in | Open reports | Admin/manager allowed; agent denied | P0 | Critical | E2E |
| FT-023 | Reports | Agent detail drawer | Leadership | Agent in scope | Open report detail | Tabs render and data is scoped | P1 | High | Functional |
| FT-024 | Users | Users access | All | Logged in | Open users | Admin all users; manager team agents; agent denied | P0 | Critical | E2E |
| FT-025 | Users | Access email/reset | Admin/Manager | Managed user exists | Send access email/reset password | Invite status and temporary password state update | P1 | High | Functional |
| FT-026 | Settings | Super Admin settings | Super Admin | Logged in | Open and update settings | Company, CRM, lead, security, email settings update | P0 | High | Functional |
| FT-027 | Account | Personal settings | All | Logged in | Update own profile/preferences/password | Own profile updates; role/team/status read-only | P1 | High | Functional |
| FT-028 | Webhooks | Connection setup | Super Admin | Logged in | Create webhook | URL available, secret returned once, stored view masked | P0 | Critical | E2E |
| FT-029 | Webhooks | Lead import | Public webhook | Active connection | Submit valid payload with secret | Imported lead created and hidden from agent until assigned | P0 | Critical | E2E |
| FT-030 | Webhooks | Failed lead inbox | Super Admin | Active connection | Submit invalid payload | Failed payload saved for review | P1 | High | E2E |
