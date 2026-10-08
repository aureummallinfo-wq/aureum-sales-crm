# 04 — Frontend Routes and Screens

## Route Guards
Every route must check authentication and role permission before rendering.

Use this structure as a reference:

```ts
type RoutePermission = {
  path: string;
  roles: UserRole[];
};
```

---

## Route Map

| Route | Screen | Allowed Roles |
|---|---|---|
| `/login` | Login | Public |
| `/dashboard` | Dashboard | Super Admin, Sales Manager, Sales Agent |
| `/leads/all` | All Leads | Super Admin, Sales Manager |
| `/leads/my` | My Leads | Super Admin, Sales Manager, Sales Agent |
| `/leads/new` | Add New Lead | Sales Manager |
| `/customers` | Customers | Super Admin, Sales Manager, Sales Agent |
| `/follow-ups` | Follow-ups | Super Admin, Sales Manager, Sales Agent |
| `/team-chat` | Team Chat | Super Admin, Sales Manager, Sales Agent |
| `/reports` | Agent-wise Reports | Super Admin, Sales Manager |
| `/agents` | Agents Management | Super Admin, Sales Manager |
| `/settings` | Settings | Super Admin |

---

## Layout Shell
All authenticated screens should use the same layout:

```txt
AppShell
├── Sidebar
├── Topbar
└── MainContent
```

## Sidebar Behavior
Render sidebar items based on the logged-in user role.

### Super Admin
```ts
['Dashboard', 'All Leads', 'My Leads', 'Customers', 'Follow-ups', 'Team Chat', 'Reports', 'Agents', 'Settings']
```

### Sales Manager
```ts
['Dashboard', 'All Leads', 'My Leads', 'Add New Lead', 'Customers', 'Follow-ups', 'Team Chat', 'Reports', 'Agents']
```

### Sales Agent
```ts
['Dashboard', 'My Leads', 'Customers', 'Follow-ups', 'Team Chat']
```

---

## Screen Components

### Login Screen
- Split layout
- Brand panel
- Login form
- Email/phone field
- Password field
- Remember me
- Forgot password
- Login button

### Dashboard Screen
- KPI cards
- Lead inflow chart
- Lead sources chart
- Follow-up performance chart
- Agent performance chart
- Conversion overview
- Recent leads
- Today’s follow-ups

### All Leads Screen
- Status tabs
- Filters
- Search
- Data table
- Lead actions
- Assign/reassign controls

### My Leads Screen
- Assigned leads only
- Status filters
- Lead table
- Quick actions

### Add New Lead Screen
- Lead form
- Customer info
- Requirement info
- CRM info
- Save buttons

### Customers Screen
- Customer table
- Filters
- Search
- Customer Detail Drawer

### Customer Detail Drawer
- Contact info
- Interest info
- Notes
- Timeline
- Follow-ups
- Actions

### Follow-ups Screen
- Summary cards
- Date filters
- Calendar filter
- Advanced filters
- Follow-up table
- Follow-up Detail Drawer

### Team Chat Screen
- Chat sidebar
- Channels
- Direct messages
- Main chat area
- Right info panel

### Reports Screen
- Date filters
- KPI cards
- Charts
- Agent performance table
- Agent Detail Drawer

### Agents Screen
- Agent table
- Add/edit agent drawer
- Agent detail drawer

### Settings Screen
- Company settings
- Roles/permissions
- Lead statuses/tags
- Lead sources
- Notifications
- CRM preferences
