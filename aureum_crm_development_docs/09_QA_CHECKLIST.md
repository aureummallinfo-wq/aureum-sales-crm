# 09 — QA Checklist

## Authentication
- [ ] Login works with valid credentials
- [ ] Invalid login shows error
- [ ] User role is loaded after login
- [ ] Logout clears session
- [ ] Protected routes redirect unauthenticated users

## Sidebar
- [ ] Super Admin sees correct sidebar
- [ ] Sales Manager sees correct sidebar
- [ ] Sales Agent sees correct sidebar
- [ ] Restricted items are not shown
- [ ] Active sidebar state works

## Route Permissions
- [ ] Sales Agent cannot access `/leads/all`
- [ ] Sales Agent cannot access `/leads/new`
- [ ] Sales Agent cannot access `/reports`
- [ ] Sales Agent cannot access `/agents`
- [ ] Sales Agent cannot access `/settings`
- [ ] Sales Manager cannot access `/settings`
- [ ] Super Admin can access allowed screens

## Backend Permissions
- [ ] Restricted API endpoints reject unauthorized roles
- [ ] Sales Agent cannot fetch all leads
- [ ] Sales Agent cannot create lead
- [ ] Sales Agent cannot fetch another agent’s customer
- [ ] Sales Agent cannot fetch reports
- [ ] Sales Manager cannot fetch settings

## Leads
- [ ] All Leads loads for Super Admin
- [ ] All Leads loads for Sales Manager
- [ ] All Leads blocked for Sales Agent
- [ ] My Leads shows assigned leads only
- [ ] Lead filters work
- [ ] Lead status update works
- [ ] Lead assignment works for allowed roles only

## Add New Lead
- [ ] Sales Manager can open Add New Lead
- [ ] Sales Manager can create lead
- [ ] Sales Agent cannot open Add New Lead
- [ ] Required field validation works
- [ ] Created lead appears in lead list

## Customers
- [ ] Customer list loads by role
- [ ] Sales Agent sees own customers only
- [ ] Customer drawer opens from right side
- [ ] Notes and timeline display correctly
- [ ] Customer quick actions are visible by permission

## Follow-ups
- [ ] Follow-up list loads by role
- [ ] Today filter works
- [ ] Overdue filter works
- [ ] Custom date range works
- [ ] Calendar filter works
- [ ] Mark Done works
- [ ] Reschedule works
- [ ] Sales Agent sees own follow-ups only

## Team Chat
- [ ] Channels load
- [ ] Direct messages load
- [ ] Sending message works
- [ ] Attachments display
- [ ] Unread count works
- [ ] Sales Agent cannot access management-only channels if restricted

## Reports
- [ ] Reports load for Super Admin
- [ ] Reports load for Sales Manager
- [ ] Reports blocked for Sales Agent
- [ ] Date filters work
- [ ] Agent table loads
- [ ] Agent detail drawer opens
- [ ] Export buttons are permission-controlled

## Agents
- [ ] Agents screen loads for Super Admin
- [ ] Agents screen loads for Sales Manager
- [ ] Agents screen blocked for Sales Agent
- [ ] Add Agent form works for allowed roles
- [ ] Role dropdown only includes Sales Manager and Sales Agent
- [ ] No Admin role appears
- [ ] Deactivate action works for allowed roles

## Settings
- [ ] Settings opens for Super Admin
- [ ] Settings blocked for Sales Manager
- [ ] Settings blocked for Sales Agent
- [ ] Company settings save
- [ ] Lead status settings save
- [ ] Lead source settings save

## Design System
- [ ] Cream/ivory background applied
- [ ] Dark sidebar applied
- [ ] Champagne gold active states applied
- [ ] Cards have rounded corners and soft shadows
- [ ] Tables are readable
- [ ] Status badges are consistent
- [ ] UI does not use bright blue/purple generic SaaS colors

## Responsive
- [ ] Desktop layout works
- [ ] Tablet layout works
- [ ] Mobile layout works
- [ ] Tables scroll or convert to cards
- [ ] Drawers are usable on mobile

## Excluded Modules
- [ ] Projects module not present
- [ ] Properties/Units module not present
- [ ] Visits screen not present
- [ ] Tasks screen not present
- [ ] Meetings screen not present
- [ ] Complex opportunity pipeline not present
