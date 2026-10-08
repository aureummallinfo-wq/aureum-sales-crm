# 06 — API Endpoints

Use REST or equivalent server actions. Every endpoint must enforce authentication and role permissions.

## Auth

### POST `/api/auth/login`
Login user.

Request:
```json
{
  "emailOrPhone": "manager@aureum.com",
  "password": "password"
}
```

Response:
```json
{
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "fullName": "Sales Manager",
    "role": "SALES_MANAGER"
  }
}
```

### POST `/api/auth/logout`
Logout user.

### GET `/api/auth/me`
Return current user.

---

## Dashboard

### GET `/api/dashboard`
Returns role-based dashboard data.

Rules:
- Super Admin: all company data
- Sales Manager: team/company sales data as configured
- Sales Agent: own data only

---

## Leads

### GET `/api/leads/all`
Allowed roles:
- Super Admin
- Sales Manager

Returns all/team leads.

### GET `/api/leads/my`
Allowed roles:
- Super Admin
- Sales Manager
- Sales Agent

Returns leads assigned to logged-in user.

### POST `/api/leads`
Allowed roles:
- Sales Manager

Creates a new lead.

### GET `/api/leads/:id`
Allowed roles:
- Super Admin
- Sales Manager
- Sales Agent if assigned

### PATCH `/api/leads/:id`
Allowed roles:
- Super Admin
- Sales Manager
- Sales Agent if assigned and updating allowed fields

### PATCH `/api/leads/:id/assign`
Allowed roles:
- Super Admin
- Sales Manager

### PATCH `/api/leads/:id/status`
Allowed roles:
- Super Admin
- Sales Manager
- Sales Agent if assigned

### DELETE `/api/leads/:id`
Allowed roles:
- Super Admin only

---

## Customers

### GET `/api/customers`
Allowed roles:
- Super Admin: all customers
- Sales Manager: all/team customers
- Sales Agent: assigned customers only

### GET `/api/customers/:id`
Allowed roles:
- Super Admin
- Sales Manager
- Sales Agent if assigned

### PATCH `/api/customers/:id`
Allowed roles:
- Super Admin
- Sales Manager
- Sales Agent if assigned and updating allowed fields

### GET `/api/customers/:id/timeline`
Returns customer activity timeline.

### GET `/api/customers/:id/follow-ups`
Returns customer follow-up history.

---

## Follow-ups

### GET `/api/follow-ups`
Allowed roles:
- Super Admin: all follow-ups
- Sales Manager: team follow-ups
- Sales Agent: own follow-ups only

Query params:
- status
- assignedAgentId
- type
- priority
- startDate
- endDate
- search

### POST `/api/follow-ups`
Allowed roles:
- Super Admin
- Sales Manager
- Sales Agent for own assigned customer/lead only

### GET `/api/follow-ups/:id`
Allowed roles based on visibility.

### PATCH `/api/follow-ups/:id/complete`
Marks follow-up complete.

### PATCH `/api/follow-ups/:id/reschedule`
Reschedules follow-up.

### PATCH `/api/follow-ups/:id/cancel`
Cancels follow-up.

---

## Team Chat

### GET `/api/chat/channels`
Returns allowed channels for user.

### POST `/api/chat/channels`
Allowed roles:
- Super Admin
- Sales Manager if enabled

### GET `/api/chat/channels/:id/messages`
Returns channel messages.

### POST `/api/chat/channels/:id/messages`
Creates message.

### POST `/api/chat/uploads`
Uploads attachment.

---

## Reports

### GET `/api/reports/agents`
Allowed roles:
- Super Admin
- Sales Manager

Returns agent-wise performance report.

Query params:
- startDate
- endDate
- teamId
- agentId
- leadStatus
- source

### GET `/api/reports/agents/:id`
Allowed roles:
- Super Admin
- Sales Manager

Returns individual agent detail report.

### GET `/api/reports/export`
Allowed roles:
- Super Admin
- Sales Manager

Exports report as PDF/Excel.

---

## Agents

### GET `/api/agents`
Allowed roles:
- Super Admin
- Sales Manager

### POST `/api/agents`
Allowed roles:
- Super Admin
- Sales Manager if enabled

### GET `/api/agents/:id`
Allowed roles:
- Super Admin
- Sales Manager

### PATCH `/api/agents/:id`
Allowed roles:
- Super Admin
- Sales Manager for team agents only

### PATCH `/api/agents/:id/deactivate`
Allowed roles:
- Super Admin
- Sales Manager if enabled

---

## Settings

### GET `/api/settings`
Allowed roles:
- Super Admin only

### PATCH `/api/settings/company`
Allowed roles:
- Super Admin only

### PATCH `/api/settings/lead-statuses`
Allowed roles:
- Super Admin only

### PATCH `/api/settings/lead-sources`
Allowed roles:
- Super Admin only

### PATCH `/api/settings/notifications`
Allowed roles:
- Super Admin only

---

## Notes

### POST `/api/notes`
Creates note on lead, customer, follow-up, or agent.

### GET `/api/notes`
Returns notes by entity.

---

## Activity Logs

### GET `/api/activity`
Returns activity logs based on role permission.

### POST `/api/activity`
Usually internal only. Create logs automatically from actions.
