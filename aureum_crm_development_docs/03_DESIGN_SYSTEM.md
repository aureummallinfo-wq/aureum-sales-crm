# 03 — Design System

## Design Direction
The CRM should feel like a premium real-estate sales command center, not a generic SaaS admin panel.

## Brand Style
- Luxury real-estate
- Premium
- Calm
- Professional
- Elegant
- Warm
- Clean

## Colors

```css
:root {
  --background-main: #F7F1E6;
  --card-background: #FFFFFF;
  --soft-beige: #EFE4D2;
  --sidebar-dark: #111111;
  --deep-brown: #2A2118;
  --champagne-gold: #C6A15B;
  --soft-gold: #E2C67A;
  --text-dark: #1D1A16;
  --text-muted: #7A7167;
  --gold-border: rgba(198, 161, 91, 0.35);
  --success-green: #2F6B4F;
  --warning-amber: #C88A2D;
  --error-red: #B94A48;
}
```

## Typography
Use an elegant serif for main brand headings and a clean sans-serif for UI.

Recommended:
- Headings: Playfair Display, Cormorant Garamond, or similar
- UI text: Inter, Manrope, Lato, or similar

## Layout Rules
- Dark left sidebar
- Warm cream page background
- White or beige cards
- Thin gold borders
- Rounded corners
- Soft shadows
- Clear spacing
- Professional tables
- Right-side drawers for detail views

## Reusable Components
Implement these reusable UI components:

### Layout
- `AppShell`
- `Sidebar`
- `Topbar`
- `PageHeader`
- `ContentGrid`

### Data Display
- `KpiCard`
- `DataTable`
- `StatusBadge`
- `PriorityBadge`
- `ChartCard`
- `Timeline`

### Forms
- `TextInput`
- `SelectInput`
- `DateInput`
- `TimeInput`
- `Textarea`
- `SearchInput`
- `FilterBar`

### Actions
- `PrimaryButton`
- `SecondaryButton`
- `GhostButton`
- `IconButton`
- `DangerButton`

### Drawers and Modals
- `RightDrawer`
- `ConfirmModal`
- `CreateLeadDrawer`
- `CustomerDetailDrawer`
- `FollowUpDetailDrawer`
- `AgentDetailDrawer`

## Badge Colors

### Lead Status Badges
- New: soft beige
- Hot: gold / amber
- Warm: soft gold
- Cold: muted beige / gray-brown
- Follow-up: amber
- Negotiation: deep brown / gold
- Booking: champagne gold
- Closed Won: success green
- Closed Lost: muted red
- Not Interested: muted gray-brown
- Invalid: red / gray

### Follow-up Status Badges
- Pending: soft gold
- Completed: green
- Overdue: red
- Missed: red / amber
- Rescheduled: beige / brown
- Cancelled: muted gray

## Buttons

### Primary Button
- Background: champagne gold
- Text: dark brown or white
- Rounded corners
- Subtle shadow

### Secondary Button
- Background: white or cream
- Border: gold
- Text: deep brown

### Danger Button
- Background: soft red
- Text: white

## Do Not Use
- Bright blue
- Purple
- Neon gradients
- Generic SaaS dashboard visuals
- Public website navbar
- Signup UI
- Heavy cluttered layouts
