# Aureum Sales CRM — Development Docs

These Markdown files are prepared for developer implementation through Codex or any AI coding assistant.

## Project
**Aureum Sales CRM** is a custom real-estate sales CRM for **Aureum Mall & Residences**.

The CRM must manage:
- Leads
- Customers
- Follow-ups
- Internal team chat
- Agent-wise reports
- Agents management
- Settings
- Role-based access

## Phase 1 Goal
Build a clean, secure, role-based CRM MVP for sales operations.

The CRM should be simple enough for daily sales team use but structured enough for reporting, permissions, and future expansion.

## Recommended Implementation Order
1. Authentication and role-based routing
2. Layout shell and sidebar
3. Design system and reusable components
4. Database schema and seed data
5. Leads module
6. Customers module
7. Follow-ups module
8. Team chat module
9. Reports module
10. Agents management module
11. Settings module
12. Dashboard and final QA

## Files
- `01_PROJECT_SCOPE.md` — Phase 1 scope and excluded modules
- `02_ROLES_AND_PERMISSIONS.md` — role-based screen access and action permissions
- `03_DESIGN_SYSTEM.md` — theme, colors, typography, components
- `04_FRONTEND_ROUTES_AND_SCREENS.md` — frontend route map and screen structure
- `05_DATABASE_SCHEMA.md` — database tables and relationships
- `06_API_ENDPOINTS.md` — API endpoint plan
- `07_SCREEN_REQUIREMENTS.md` — implementation details for each screen
- `08_CODEX_IMPLEMENTATION_PROMPTS.md` — step-by-step prompts for Codex
- `09_QA_CHECKLIST.md` — testing and acceptance checklist

## Important Rule
Do not build modules that are removed from Phase 1:
- Projects
- Properties / Units
- Visits
- Tasks
- Meetings
- Full complex opportunity pipeline
