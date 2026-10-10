# Unit Test Cases

| Test Case ID | Module | Feature | Role | Precondition | Steps | Expected Result | Priority | Severity | Automation Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UT-001 | Auth / Routes | Super Admin route access | Super Admin | Route matrix loaded | Check all admin routes | Admin can access dashboard, all-leads, my-leads, customers, follow-ups, team-chat, reports, users, settings, my-account | P0 | Critical | Unit |
| UT-002 | Auth / Routes | Sales Manager route access | Sales Manager | Route matrix loaded | Check manager routes | Manager can access allowed team routes and cannot access settings | P0 | Critical | Unit |
| UT-003 | Auth / Routes | Sales Agent route access | Sales Agent | Route matrix loaded | Check agent routes | Agent can access own workspace routes and cannot access all-leads, add-lead, reports, users, settings | P0 | Critical | Unit |
| UT-004 | Auth / Routes | Unknown role deny | Unknown | Unknown role supplied | Check any protected route | Unknown role is denied by default | P0 | Critical | Unit |
| UT-005 | Auth / Routes | Unknown route deny | All | Unknown route supplied | Check unknown route | Unknown protected route is denied by default | P0 | Critical | Unit |
| UT-006 | Leads | Lead ownership | Sales Agent | Agent and other-agent lead exist | Check owned and non-owned leads | Agent sees own lead only | P0 | Critical | Unit |
| UT-007 | Customers | Customer ownership | Sales Agent | Agent and other-agent customer exist | Check owned and non-owned customers | Agent sees own customer only | P0 | Critical | Unit |
| UT-008 | Follow-ups | Follow-up ownership | Sales Agent, Sales Manager | Follow-ups across agents/teams exist | Check role-scoped follow-ups | Agent sees own; manager sees own team | P0 | Critical | Unit |
| UT-009 | Permissions | Manager team scope | Sales Manager | Other-team records exist | Check users, leads, customers, follow-ups, reports | Manager cannot access another team's data | P0 | Critical | Unit |
| UT-010 | Auth | Password policy | All | Password policy loaded | Validate weak and compliant passwords | Strong password required and new password differs from current | P0 | High | Unit |
| UT-011 | Users | Temporary password expiry | New user | Temporary password configured | Check expiry behavior | Expired temporary password blocks login | P0 | Critical | Unit |
| UT-012 | Auth | mustChangePassword guard | New user | `mustChangePassword=true` | Check protected routes | User can only access change-password/account/auth endpoints | P0 | Critical | Unit |
| UT-013 | Follow-ups | Overdue calculation | All | Follow-up dates exist | Evaluate past and completed follow-ups | Pending past due is overdue; completed/cancelled is not | P1 | High | Unit |
| UT-014 | Reports | Conversion rate | Leadership | Report inputs exist | Calculate conversion rate | Closed Won / Assigned Leads * 100, denominator 0 returns 0 | P1 | High | Unit |
| UT-015 | Dashboard | Role metrics | All | Seed data loaded | Compare role scopes | Admin company metrics; manager team metrics; agent own metrics | P1 | High | Unit |
| UT-016 | Users | User permissions | All | Users across roles exist | Evaluate manage permissions | Admin manages managers/agents; manager manages team agents; agent manages none | P0 | Critical | Unit |
| UT-017 | Settings | Settings permissions | All | Settings hooks loaded | Check settings access | Only Super Admin can access settings | P0 | Critical | Unit |
| UT-018 | Webhooks | Secret validation | Public webhook | Connection exists | Validate valid, missing, invalid secrets | Valid passes; missing/invalid fail; full secret not exposed | P0 | Critical | Unit |
| UT-019 | Webhooks | Duplicate detection | Public webhook | Existing lead identifiers exist | Check duplicate rules | external ID, idempotency, payload hash, phone, WhatsApp, email prevent duplicate lead creation | P0 | Critical | Unit |
| UT-020 | Webhooks | Field mapping | Public webhook | Inbound payload exists | Normalize aliases | Incoming fields map to CRM lead fields; invalid payload is rejected or saved to failed inbox | P1 | High | Unit |
