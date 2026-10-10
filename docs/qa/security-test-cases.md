# Security Test Cases

| Test Case ID | Module | Feature | Role | Precondition | Steps | Expected Result | Priority | Severity | Automation Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | Auth | Protected API unauthenticated | Public | No session | Call protected API | `401`, no data returned | P0 | Critical | E2E |
| SEC-002 | Auth | Safe login failure | Public | Invalid login | Submit unknown email/password | Generic error, no account existence leak | P0 | High | E2E |
| SEC-003 | Auth | Session logout | All | Logged in | Logout then call protected API | Session invalidated | P0 | High | Functional |
| SEC-004 | Auth | mustChangePassword | New user | Temporary password login | Call dashboard API | `403 PASSWORD_CHANGE_REQUIRED` | P0 | Critical | E2E |
| SEC-005 | Auth | Inactive login | Inactive user | Account inactive | Attempt login | Login blocked with safe message | P0 | Critical | Functional |
| SEC-006 | Auth | Suspended login | Suspended user | Account suspended | Attempt login | Login blocked with safe message | P0 | Critical | Functional |
| SEC-007 | CSRF | Origin guard | Auth user | Session cookie exists | Send mutating API with hostile Origin | `403` origin denied | P0 | High | E2E |
| SEC-008 | Static files | Backend source isolation | Public | Server running | Request backend JS path | `404`, source not served | P0 | Critical | E2E |
| SEC-009 | Leads | Lead IDOR | Sales Agent | Other-agent lead exists | GET other lead ID | `403`, no sensitive data | P0 | Critical | E2E |
| SEC-010 | Customers | Customer IDOR | Sales Agent | Other customer exists | GET other customer ID | `403`, no sensitive data | P0 | Critical | Functional |
| SEC-011 | Follow-ups | Follow-up IDOR | Sales Agent | Other follow-up exists | GET other follow-up ID | `403`, no sensitive data | P0 | Critical | Functional |
| SEC-012 | Reports | Direct report API bypass | Sales Agent | Logged in as agent | Call reports API | `403` | P0 | Critical | E2E |
| SEC-013 | Users | Direct users API bypass | Sales Agent | Logged in as agent | Call users API | `403` | P0 | Critical | E2E |
| SEC-014 | Settings | Direct settings API bypass | Sales Manager/Agent | Logged in | Call settings API | `403` | P0 | Critical | E2E |
| SEC-015 | Webhooks | Missing webhook secret | Public | Active connection | POST without secret | `401` | P0 | Critical | E2E |
| SEC-016 | Webhooks | Invalid webhook secret | Public | Active connection | POST invalid secret | `401` | P0 | Critical | QA |
| SEC-017 | Webhooks | Secret masking | Super Admin | Connection exists | Fetch connection | Secret hash/full token absent; masked value shown | P0 | Critical | E2E |
| SEC-018 | Webhooks | Duplicate prevention | Public | Existing payload sent | Send duplicate payload | Existing lead matched, no duplicate created | P0 | Critical | E2E |
| SEC-019 | XSS | Input/script payloads | All | Forms available | Submit XSS strings in notes/chat/settings/webhooks | Payload escaped/sanitized/rejected; no script executes | P0 | Critical | QA |
| SEC-020 | Audit | Security event logging | All | Denied action occurs | Trigger blocked access | Security event recorded where supported | P1 | High | QA |
