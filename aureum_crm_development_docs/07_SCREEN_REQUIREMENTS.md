# 07 — Screen Requirements

## 1. Login Screen

### Purpose
Allow users to login and redirect based on role.

### Fields
- Email or phone
- Password
- Remember me
- Forgot password

### Behavior
- Authenticate user
- Store session/token securely
- Redirect to `/dashboard`
- Load role-based sidebar

---

## 2. Dashboard Screen

### Purpose
Show sales overview and daily activity.

### Components
- KPI cards
- Lead inflow chart
- Lead source donut chart
- Follow-up performance chart
- Agent performance chart
- Conversion overview
- Recent leads table
- Today’s follow-ups table

### Role Behavior
- Super Admin: all company data
- Sales Manager: team/company data
- Sales Agent: own data only

---

## 3. All Leads Screen

### Access
- Super Admin
- Sales Manager

### Components
- Status tabs
- Search
- Filters
- Data table
- Row actions

### Tabs
- All Leads
- New
- Hot
- Warm
- Cold
- Follow-up
- Visit Scheduled
- Negotiation
- Booking
- Closed Won
- More

### Table Columns
- Lead Name
- Phone / WhatsApp
- Email
- City
- Interested In
- Budget
- Lead Source
- Assigned Agent
- Lead Status
- Tags
- Next Follow-up
- Created Date
- Last Contacted
- Actions

---

## 4. My Leads Screen

### Access
- Super Admin
- Sales Manager
- Sales Agent

### Purpose
Show assigned leads only.

### Actions
- Open Lead
- Call
- WhatsApp
- Add Note
- Schedule Follow-up
- Change Status

### Sales Agent Restrictions
Sales Agent must not see:
- Assign Agent
- Delete Lead
- All Leads
- Reports
- Agents
- Settings

---

## 5. Add New Lead Screen

### Access
- Sales Manager only

### Fields
Customer information:
- Full Name
- Phone Number
- WhatsApp Number
- Email
- City
- Area
- Preferred Contact Method

Requirement information:
- Interested In
- Budget
- Property Type
- Preferred Location
- Purpose
- Buying Timeline
- Financing Requirement

CRM information:
- Lead Source
- Assigned Agent
- Lead Status
- Tags
- Next Follow-up Date
- Notes

### Buttons
- Save Lead
- Save & Add Another
- Cancel

---

## 6. Customers Screen

### Access
- Super Admin
- Sales Manager
- Sales Agent

### Purpose
Show customer profiles.

### Components
- Summary cards
- Customer tabs
- Search and filters
- Customer table
- Customer Detail Drawer

### Table Columns
- Customer Name
- Phone / WhatsApp
- Email
- City
- Interested In
- Budget
- Assigned Agent
- Customer Status
- Last Activity
- Next Follow-up
- Actions

---

## 7. Customer Detail Drawer

### Trigger
Opens from right side when a customer row is clicked.

### Content
- Customer name
- Status
- Assigned agent
- Source
- Contact information
- Interest information
- Notes
- Timeline
- Follow-ups

### Actions
- Call
- WhatsApp
- Add Note
- Schedule Follow-up
- Edit

---

## 8. Follow-ups Screen

### Access
- Super Admin
- Sales Manager
- Sales Agent

### Purpose
Manage customer reminders and next actions.

### Summary Cards
- Today’s Follow-ups
- Overdue
- Upcoming
- Completed
- Missed
- Total Follow-ups

### Date Filters
- Today
- Tomorrow
- This Week
- This Month
- Overdue
- Custom Range
- Calendar View

### Advanced Filters
- Assigned Agent
- Follow-up Status
- Follow-up Type
- Lead Status
- Priority
- Source

### Table Columns
- Customer Name
- Phone / WhatsApp
- Follow-up Type
- Assigned Agent
- Lead Status
- Due Date
- Due Time
- Priority
- Status
- Last Activity
- Actions

### Actions
- Open Customer
- Call
- WhatsApp
- Mark Done
- Reschedule
- Add Note

---

## 9. Team Chat Screen

### Access
- Super Admin
- Sales Manager
- Sales Agent

### Purpose
Internal team communication only.

### Features
- Channels
- Direct messages
- Text messages
- File attachments
- Unread count
- Message time
- Online/offline status

### Channels
- General
- Sales Team
- Announcements
- Follow-ups
- Bookings
- Management

### Do Not Add
- Customer WhatsApp inbox
- Voice/video call
- Reactions
- Advanced social features

---

## 10. Reports Screen

### Access
- Super Admin
- Sales Manager

### Purpose
Agent-wise sales performance reporting.

### Components
- Date filters
- KPI cards
- Charts
- Agent performance table
- Agent Detail Drawer

### Table Columns
- Agent Name
- Team
- Assigned Leads
- Contacted Leads
- Hot Leads
- Follow-ups Completed
- Overdue Follow-ups
- Closed Deals
- Lost Leads
- Conversion Rate
- Last Activity
- Action

---

## 11. Agents Management Screen

### Access
- Super Admin
- Sales Manager

### Table Columns
- Agent Name
- Phone / Email
- Team
- Role
- Assigned Leads
- Active Leads
- Closed Deals
- Follow-ups Due
- Status
- Last Activity
- Actions

### Actions
- View Agent
- Edit Agent
- Assign Team
- View Leads
- View Report
- Deactivate

### Add Agent Fields
- Full Name
- Phone
- Email
- Role
- Team
- Password / Invite User
- Status

Allowed roles in dropdown:
- Sales Manager
- Sales Agent

---

## 12. Settings Screen

### Access
- Super Admin only

### Sections
- Company Settings
- Role & Permission Settings
- Lead Status / Tags Settings
- Lead Source Settings
- Notification Settings
- CRM Preferences
