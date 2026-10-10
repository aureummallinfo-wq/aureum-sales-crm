# Browser QA Checklist

| Test Case ID | Module | Feature | Role | Precondition | Steps | Expected Result | Priority | Severity | Automation Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BS-001 | Auth | Login page visual smoke | Public | Browser open | Load `/login` at desktop/tablet/mobile | No overlap, broken logo, or form layout issue | P1 | Medium | Browser |
| BS-002 | Shell | Sidebar visual consistency | All | Logged in | Compare role sidebars | Icons, labels, active states, role menu items render correctly | P1 | Medium | Browser |
| BS-003 | Shell | Topbar visual consistency | All | Logged in | Use search/profile/logout | Topbar controls do not overlap | P1 | Medium | Browser |
| BS-004 | Dashboard | Dashboard visual smoke | All | Logged in | Open dashboard | Cards, charts, filters align | P1 | Medium | Browser |
| BS-005 | Leads | Leads table visual smoke | Leadership | Logged in | Open leads | Columns, badges, action menus, scroll behave | P1 | Medium | Browser |
| BS-006 | Leads | Lead drawer visual smoke | Permitted user | Lead exists | Open drawer | Drawer width, close, tabs, content stable | P1 | Medium | Browser |
| BS-007 | Leads | Add Lead visual smoke | Sales Manager | Logged in | Open add lead | Fields, labels, validation align | P1 | Medium | Browser |
| BS-008 | Customers | Customers visual smoke | All | Logged in | Open customers/drawer | Cards/table, filters, tabs, notes, timeline render | P1 | Medium | Browser |
| BS-009 | Follow-ups | Follow-ups visual smoke | All | Logged in | Open follow-ups | Calendar, tabs, cards, filters, table align | P1 | Medium | Browser |
| BS-010 | Team Chat | Chat visual smoke | All | Logged in | Open chat | Sidebar, DMs, messages, input, info panel render | P1 | Medium | Browser |
| BS-011 | Reports | Reports visual smoke | Leadership | Logged in | Open reports | Cards, charts, tables, drawer, filters render | P1 | Medium | Browser |
| BS-012 | Users | Users visual smoke | Leadership | Logged in | Open users | Table, badges, invite status, drawers render | P1 | Medium | Browser |
| BS-013 | Settings | Settings visual smoke | Super Admin | Logged in | Open settings | Section nav, forms, save bar, tabs align | P1 | Medium | Browser |
| BS-014 | Account | My Account visual smoke | All | Logged in | Open my-account | Profile/security/preferences/activity render | P1 | Medium | Browser |
| BS-015 | Webhooks | Webhook visual smoke | Super Admin | Logged in | Open webhook settings | Connections, mapping, logs, failed inbox clear | P1 | Medium | Browser |
| BS-016 | Responsive | Mobile smoke | All | 375x812 and 430x932 | Open major screens | Sidebar mobile menu, drawers full screen, tables scroll/card | P1 | High | Browser |
| BS-017 | Responsive | Tablet smoke | All | 768x1024 | Open major screens | Layout stacks, drawers use appropriate width, filters do not overlap | P1 | Medium | Browser |
| BS-018 | UI Foundation | Typography consistency | All | Major screens loaded | Inspect text hierarchy | Headings, labels, badges, buttons consistent | P2 | Medium | Browser |
| BS-019 | UI Foundation | Theme consistency | All | Major screens loaded | Inspect colors | Warm cream, white, champagne gold, charcoal, deep brown theme retained | P2 | Medium | Browser |
| BS-020 | Console/network | Console and network smoke | All | Major screens loaded | Watch console/network | No console errors, failed assets, broken chunks, unhandled rejections | P1 | High | Browser |
