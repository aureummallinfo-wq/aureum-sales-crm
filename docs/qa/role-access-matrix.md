# Aureum Sales CRM Role Access Matrix

| Route | Public | Super Admin | Sales Manager | Sales Agent | HR | Project Manager | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/login` | Yes | Yes | Yes | Yes | Yes | Yes | Unauthenticated entry point. |
| `/dashboard` | No | Yes | Yes | Yes | Yes | Yes | Role-scoped metrics. |
| `/all-leads` | No | Yes | Yes | No | No | No | HR and Project Manager are not sales-owner roles. |
| `/my-leads` | No | Yes | Yes | Yes | No | No | Owned/assigned sales view. |
| `/add-lead` | No | Yes | Yes | Yes | No | No | Sales roles only. |
| `/customers` | No | Yes | Yes | Yes | No | No | Data scoped by sales role. |
| `/follow-ups` | No | Yes | Yes | Yes | No | No | Data scoped by sales role. |
| `/tasks` | No | Yes | Yes | Yes | Yes | Yes | Operational task access. |
| `/team-chat` | No | Yes | Yes | Yes | Yes | Yes | Internal communication. |
| `/reports` | No | Yes | Yes | No | No | Yes | Project Manager receives oversight reporting. |
| `/users` | No | Yes | Yes | No | No | No | Only Super Admin creates HR/Project Manager; Managers remain sales-scoped. |
| `/settings` | No | Yes | No | No | No | No | Super Admin only. |
| `/my-account` | No | Yes | Yes | Yes | Yes | Yes | Own profile only. |
| `/change-password` | No | Yes | Yes | Yes | Yes | Yes | Required for temporary-password users. |
| `/access-denied` | No | Yes | Yes | Yes | Yes | Yes | Authenticated users only. |
| `/api/webhooks/leads/:id` | Token | N/A | N/A | N/A | Public endpoint protected by secret token. |

## Blocked Behaviors

- Sales Agent cannot access All Leads, Reports, Users, Settings, or settings webhooks. Sales Agents can add leads within their own assignment scope.
- Sales Manager cannot access Settings or webhook configuration.
- Unauthenticated users receive `401` on protected APIs.
- Cross-agent and cross-team IDOR attempts receive `403` or scoped `404`.
- Users with `mustChangePassword=true` are blocked from workspace APIs until password change is complete.
