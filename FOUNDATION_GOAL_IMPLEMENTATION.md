# Foundation Goal — User-Friendly Experience & Frontend Library System

## Delivered in the current buildless preview

The existing local CRM remains dependency-free so the Stitch-inspired preview can run immediately with `npm start`. A shared Aureum foundation layer now sits underneath all Goals 1–5 screens.

### Shared design system

- Central Aureum color tokens for cream, ivory, soft beige, champagne gold, deep brown, charcoal, muted text, success, warning, and error.
- Shared focus rings, reduced-motion behavior, responsive drawer behavior, hover states, tooltips, skeleton loading, error states, and skip navigation.
- Reusable status badge, stat card, empty state, loading state, error state, debounce, date, validation, and table-model helpers exposed through `AureumUI`.

### Shared interaction behavior

- Escape closes active drawers.
- Keyboard focus styles are visible across controls.
- Loading and error states are used by API-backed dashboard, leads, customers, and follow-ups screens.
- Search fields use debounced foundation behavior where appropriate.
- Existing tables, drawers, cards, forms, filters, badges, and toasts share the same Aureum visual language.

### Foundation mapping

| Blueprint responsibility | Current implementation |
|---|---|
| shadcn/Radix-style primitives | `AureumUI` primitives plus shared CSS contracts |
| Tailwind theme tokens | CSS custom properties in `ui-foundation.css` |
| TanStack Table behavior | `AureumUI.table` pagination/filter/sort model for the buildless runtime |
| React Hook Form/Zod patterns | Shared form field contracts and `AureumUI.validation` helpers |
| TanStack Query server state | Existing `apiFetch` loaders with scoped cache state per screen |
| Zustand UI state | Shared local `state` object for drawers, filters, tabs, and role UI |
| Recharts visual language | Shared chart-card and Aureum chart styling used by dashboard |
| FullCalendar/date-fns behavior | Follow-up date range controls and foundation date utilities |
| Lucide React icon language | Inline Lucide-style SVG icons exposed by `AureumUI.icon` |
| Sonner feedback | Shared Aureum toast feedback pattern |
| Motion | Subtle drawer/card transitions with reduced-motion support |

## Files

- `frontend/ui-foundation.js` — shared runtime helpers and accessible interaction contracts.
- `ui-foundation.css` — shared tokens, focus states, skeleton/error states, motion, and responsive rules.
- `frontend/app-shell.js` / `frontend/app-runtime.js` — Goals 1–5 screens consuming the shared foundation.

## Future React migration

When the project moves to a package-managed React/TypeScript build, the public contracts in `AureumUI` should become typed components under `src/components/ui`, `src/components/layout`, `src/components/tables`, `src/components/forms`, `src/components/drawers`, `src/components/charts`, and `src/components/feedback`. The visual tokens and behavior rules can be transferred without changing the product design.
