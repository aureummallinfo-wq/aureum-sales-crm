# Goal 1 — Authentication & Role-Based Access Implementation

## Delivered

- Local session-based login and logout.
- Hashed demo passwords using Node `scrypt`.
- Current-user session endpoint.
- Role-aware sidebar and account menu.
- Protected screen navigation with an Access Denied state.
- Backend role middleware for sensitive API routes.
- Sales Agent data scope limited to the own-leads request path.
- Sales Manager blocked from Settings.
- Sales Agent blocked from All Leads, Add New Lead, Reports, Agents, and Settings.
- Super Admin access to all Goal 1 screens.

## Demo accounts

All demo accounts use the password `Aureum123!`:

| Email | Role |
|---|---|
| `admin@aureum.com` | Super Admin |
| `manager@aureum.com` | Sales Manager |
| `advisor@aureum.com` | Sales Agent |

## API routes

Implemented in `server.js`:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
GET  /api/auth/permissions
GET  /api/users/me
GET  /api/users
GET  /api/leads?scope=my|all
GET  /api/reports
GET  /api/settings
```

The protected endpoints return `401` when there is no session and `403` when the logged-in role is not allowed to use the route.

## Run locally

```powershell
npm start
```

Then open `http://127.0.0.1:4173/`.

## Production follow-up

The local server is intentionally dependency-free and uses in-memory users/sessions for the prototype. Before production, replace the seed users and session map with the planned `users`, `teams`, and `sessions/auth_tokens` database tables; move the password secret and session policy into environment configuration; add persistent audit logs; and keep the same role middleware at the API boundary.
