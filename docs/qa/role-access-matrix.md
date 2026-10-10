# Aureum Sales CRM Role Access Matrix

| Route | Public | Super Admin | Sales Manager | Sales Agent | Notes |
| --- | --- | --- | --- | --- | --- |
| `/login` | Yes | Yes | Yes | Yes | Unauthenticated entry point. |
| `/dashboard` | No | Yes | Yes | Yes | Role-scoped metrics. |
| `/all-leads` | No | Yes | Yes | No | Sales Agent blocked. |
| `/my-leads` | No | Yes | Yes | Yes | Owned/assigned view. |
| `/add-lead` | No | No | Yes | No | Manager intake only. |
| `/customers` | No | Yes | Yes | Yes | Data scoped by role. |
| `/follow-ups` | No | Yes | Yes | Yes | Data scoped by role. |
| `/team-chat` | No | Yes | Yes | Yes | Management channel hidden from agents. |
| `/reports` | No | Yes | Yes | No | Agent blocked from reports. |
| `/users` | No | Yes | Yes | No | Manager limited to team Sales Agents. |
| `/settings` | No | Yes | No | No | Super Admin only. |
| `/my-account` | No | Yes | Yes | Yes | Own profile only. |
| `/change-password` | No | Yes | Yes | Yes | Required for temporary-password users. |
| `/access-denied` | No | Yes | Yes | Yes | Authenticated users only. |
| `/api/webhooks/leads/:id` | Token | N/A | N/A | N/A | Public endpoint protected by secret token. |

## Blocked Behaviors

- Sales Agent cannot access All Leads, Add Lead, Reports, Users, Settings, or settings webhooks.
- Sales Manager cannot access Settings or webhook configuration.
- Unauthenticated users receive `401` on protected APIs.
- Cross-agent and cross-team IDOR attempts receive `403` or scoped `404`.
- Users with `mustChangePassword=true` are blocked from workspace APIs until password change is complete.
