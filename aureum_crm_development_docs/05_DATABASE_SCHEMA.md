# 05 — Database Schema

This schema is a practical Phase 1 starting point. Adjust field types based on the selected backend/database.

## users
Stores CRM users.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| full_name | string | required |
| email | string | unique |
| phone | string | optional |
| password_hash | string | required if local auth |
| role | enum | SUPER_ADMIN, SALES_MANAGER, SALES_AGENT |
| team_id | uuid | nullable |
| status | enum | ACTIVE, INACTIVE |
| avatar_url | string | nullable |
| last_active_at | datetime | nullable |
| created_at | datetime | required |
| updated_at | datetime | required |

## teams
Stores sales teams.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| name | string | required |
| manager_id | uuid | FK users.id |
| status | enum | ACTIVE, INACTIVE |
| created_at | datetime | required |
| updated_at | datetime | required |

## leads
Stores lead records.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| full_name | string | required |
| phone | string | required |
| whatsapp | string | nullable |
| email | string | nullable |
| city | string | nullable |
| area | string | nullable |
| interested_in | string | required |
| budget | string/decimal | nullable |
| property_type | string | nullable |
| preferred_location | string | nullable |
| purpose | enum | INVESTMENT, SELF_USE, BUSINESS, OTHER |
| buying_timeline | string | nullable |
| financing_required | boolean | default false |
| source | string | required |
| status | string | required |
| tags | string[] | optional |
| assigned_agent_id | uuid | FK users.id |
| created_by_id | uuid | FK users.id |
| next_follow_up_at | datetime | nullable |
| last_contacted_at | datetime | nullable |
| notes | text | nullable |
| created_at | datetime | required |
| updated_at | datetime | required |

## customers
Stores customer profiles. A customer may be created from a lead.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| lead_id | uuid | FK leads.id, nullable |
| full_name | string | required |
| phone | string | required |
| whatsapp | string | nullable |
| email | string | nullable |
| city | string | nullable |
| interested_in | string | nullable |
| budget | string/decimal | nullable |
| assigned_agent_id | uuid | FK users.id |
| status | string | required |
| source | string | nullable |
| last_activity_at | datetime | nullable |
| next_follow_up_at | datetime | nullable |
| created_at | datetime | required |
| updated_at | datetime | required |

## follow_ups
Stores follow-up reminders and completion history.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| lead_id | uuid | FK leads.id, nullable |
| customer_id | uuid | FK customers.id, nullable |
| assigned_agent_id | uuid | FK users.id |
| created_by_id | uuid | FK users.id |
| type | enum | CALL, WHATSAPP, EMAIL, PAYMENT_PLAN, BOOKING, SITE_VISIT_REMINDER, GENERAL |
| due_date | date | required |
| due_time | time | required |
| priority | enum | HIGH, MEDIUM, LOW |
| status | enum | PENDING, COMPLETED, OVERDUE, MISSED, RESCHEDULED, CANCELLED |
| notes | text | nullable |
| completion_note | text | nullable |
| completed_at | datetime | nullable |
| rescheduled_from_id | uuid | nullable self reference |
| created_at | datetime | required |
| updated_at | datetime | required |

## notes
Stores notes for leads, customers, follow-ups, and agents.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| entity_type | enum | LEAD, CUSTOMER, FOLLOW_UP, AGENT |
| entity_id | uuid | required |
| note | text | required |
| created_by_id | uuid | FK users.id |
| created_at | datetime | required |
| updated_at | datetime | required |

## activity_logs
Stores timeline events and audit trail.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| entity_type | enum | LEAD, CUSTOMER, FOLLOW_UP, AGENT, SYSTEM |
| entity_id | uuid | nullable |
| action | string | required |
| description | text | required |
| performed_by_id | uuid | FK users.id |
| metadata | json | nullable |
| created_at | datetime | required |

## chat_channels
Stores internal chat channels.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| name | string | required |
| type | enum | CHANNEL, DIRECT |
| visibility | enum | ALL, MANAGEMENT, TEAM, PRIVATE |
| created_by_id | uuid | FK users.id |
| created_at | datetime | required |
| updated_at | datetime | required |

## chat_members
Stores channel membership.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| channel_id | uuid | FK chat_channels.id |
| user_id | uuid | FK users.id |
| joined_at | datetime | required |
| last_read_at | datetime | nullable |

## chat_messages
Stores chat messages.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| channel_id | uuid | FK chat_channels.id |
| sender_id | uuid | FK users.id |
| message | text | nullable |
| attachment_url | string | nullable |
| created_at | datetime | required |
| updated_at | datetime | required |

## settings
Stores CRM settings.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| key | string | unique |
| value | json | required |
| updated_by_id | uuid | FK users.id |
| updated_at | datetime | required |

## Recommended Indexes
- users.role
- users.team_id
- leads.status
- leads.source
- leads.assigned_agent_id
- leads.created_at
- customers.assigned_agent_id
- customers.status
- follow_ups.assigned_agent_id
- follow_ups.status
- follow_ups.due_date
- chat_messages.channel_id
- activity_logs.entity_type + entity_id
