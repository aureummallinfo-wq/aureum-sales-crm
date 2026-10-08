# 02 — Roles and Permissions

## Roles
Use exactly these roles:

```ts
type UserRole = 'SUPER_ADMIN' | 'SALES_MANAGER' | 'SALES_AGENT';
```

Display labels:
- Super Admin
- Sales Manager
- Sales Agent

Do not add an extra Admin role.

---

## Sidebar Access

### Super Admin Sidebar
- Dashboard
- All Leads
- My Leads
- Customers
- Follow-ups
- Team Chat
- Reports
- Agents
- Settings

### Sales Manager Sidebar
- Dashboard
- All Leads
- My Leads
- Add New Lead
- Customers
- Follow-ups
- Team Chat
- Reports
- Agents

### Sales Agent Sidebar
- Dashboard
- My Leads
- Customers
- Follow-ups
- Team Chat

---

## Screen Access Matrix

| Screen | Super Admin | Sales Manager | Sales Agent |
|---|---:|---:|---:|
| Login | Yes | Yes | Yes |
| Dashboard | Yes | Yes | Yes |
| All Leads | Yes | Yes | No |
| My Leads | Yes | Yes | Yes |
| Add New Lead | No | Yes | No |
| Customers | Yes | Yes | Yes |
| Customer Detail Drawer | Yes | Yes | Yes |
| Follow-ups | Yes | Yes | Yes |
| Team Chat | Yes | Yes | Yes |
| Reports | Yes | Yes | No |
| Agents | Yes | Yes | No |
| Settings | Yes | No | No |

---

## Data Visibility Rules

### Super Admin
- Can see all company data
- Can see all leads
- Can see all customers
- Can see all agents
- Can see all follow-ups
- Can see all reports
- Can access settings

### Sales Manager
- Can see team/company sales data depending on organization rule
- Can see all/team leads
- Can see all/team customers
- Can see team follow-ups
- Can see reports
- Can see agents
- Cannot access settings

### Sales Agent
- Can see own assigned leads only
- Can see own assigned customers only
- Can see own follow-ups only
- Can use team chat
- Cannot access All Leads
- Cannot access Add New Lead
- Cannot access Reports
- Cannot access Agents
- Cannot access Settings

---

## Action Permission Matrix

| Action | Super Admin | Sales Manager | Sales Agent |
|---|---:|---:|---:|
| View dashboard | Yes | Yes | Yes |
| View all leads | Yes | Yes | No |
| View own leads | Yes | Yes | Yes |
| Add new lead | No | Yes | No |
| Edit lead | Yes | Yes | Own leads only |
| Delete lead | Yes | No | No |
| Assign lead | Yes | Yes | No |
| Reassign lead | Yes | Yes | No |
| Change lead status | Yes | Yes | Own leads only |
| Mark lead hot/warm/cold | Yes | Yes | Own leads only |
| View customers | All | All/team | Own only |
| Edit customer | Yes | Yes | Own customers only |
| Create follow-up | Yes | Yes | Own leads/customers only |
| Mark follow-up done | Yes | Yes | Own follow-ups only |
| Reschedule follow-up | Yes | Yes | Own follow-ups only |
| View team chat | Yes | Yes | Yes |
| Create chat channel | Yes | Optional | No |
| Send team message | Yes | Yes | Yes |
| View reports | Yes | Yes | No |
| Export reports | Yes | Yes | No |
| View agents | Yes | Yes | No |
| Add agent | Yes | Yes, if allowed | No |
| Edit agent | Yes | Team agents only | No |
| Deactivate agent | Yes | Optional | No |
| Access settings | Yes | No | No |
| Edit lead statuses/tags | Yes | No | No |
| Edit lead sources | Yes | No | No |

---

## Backend Enforcement Rules
The frontend must hide restricted screens and buttons, but the backend must also reject unauthorized requests.

Examples:
- Sales Agent cannot access `/api/leads/all`
- Sales Agent cannot call create-lead API
- Sales Agent cannot open another agent’s customer by direct URL
- Sales Agent cannot access reports API
- Sales Agent cannot access agents API
- Sales Agent cannot access settings API
- Sales Manager cannot access settings API

Use middleware or server-side permission checks for every protected endpoint.
