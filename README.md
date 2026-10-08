# Aureum Sales CRM

A role-aware sales operations workspace for Aureum Mall & Residences. The Phase 1 preview includes authentication, dashboard, leads, customers, follow-ups, team chat, reports, agents management, settings, global search, notifications, audit activity, and shared UI quality patterns.

The repository is intentionally dependency-light while the product and API contracts are being finalized. It runs as a browser SPA served by a small Node.js HTTP API with in-memory demo data.

## Quick start

Requirements:

- Node.js 20 or newer
- PowerShell 5+ on Windows, or an equivalent shell for the start command

```powershell
npm run check
npm start
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/).

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `admin@aureum.com` | `Aureum123!` |
| Sales Manager | `manager@aureum.com` | `Aureum123!` |
| Sales Agent | `advisor@aureum.com` | `Aureum123!` |

These credentials are demo-only and must be replaced before any production deployment.

## Repository structure

```text
aureum-sales-crm/
├── backend/
│   └── crm-api-server.js                 # Authenticated API and local demo data
├── frontend/
│   ├── index.html                         # Browser entry point
│   ├── app-shell.js                       # Shared shell and legacy-compatible primitives
│   ├── app-runtime.js                     # Goals 1–5 API-backed runtime
│   ├── team-chat-reports-agents.js        # Goals 6–8 runtime
│   ├── settings-system-enhancements.js   # Goals 9–10 runtime
│   ├── ui-foundation.js                    # Shared icons, tokens, helpers, states
│   ├── ui-foundation.css                   # Foundation accessibility/responsive rules
│   └── aureum-design-system.css            # Aureum visual system and screen styles
├── docs/
│   ├── ARCHITECTURE.md                     # Runtime boundaries and extension guide
│   └── RELEASE_READINESS.md                # QA, security, and deployment checklist
├── aureum_crm_development_docs/           # Product blueprint and screen requirements
├── scripts/
│   └── api-smoke-test.ps1                 # Repeatable role/API acceptance checks
├── AUREUM_CRM_SCREEN_DESIGN.md             # Implemented screen design contract
├── FOUNDATION_GOAL_IMPLEMENTATION.md       # Shared foundation mapping
├── GOALS_1_5_IMPLEMENTATION_STATUS.md      # Goals 1–5 delivery notes
├── GOALS_6_8_IMPLEMENTATION_STATUS.md      # Goals 6–8 delivery notes
├── GOALS_9_10_IMPLEMENTATION_STATUS.md     # Goals 9–10 delivery notes
├── package.json                             # Commands and Node version contract
└── README.md
```

## Access model

- Super Admin: company-wide operations and Settings.
- Sales Manager: team pipeline, reports, and agent management; no Settings.
- Sales Agent: assigned leads, customers, follow-ups, and Team Chat only.

The backend applies authentication, role, team, and ownership checks to protected routes. The frontend mirrors those rules for navigation and user feedback; the backend remains the security boundary.

## Development notes

The local implementation uses secure HTTP-only session cookies, password hashing, standard error messages, security response headers, login throttling, role-filtered search, in-app notifications, activity logs, and confirmation flows for risky Settings changes. The current preview stores data in memory, so a restart resets demo changes.

Before production, replace in-memory collections with migrations and a database, add persistent audit storage, use a production session store, add real file storage/WebSockets, and connect dedicated PDF/XLSX exporters. See [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md).
