# Aureum Sales CRM Architecture

## Runtime boundaries

The project is a buildless SPA with an explicit frontend/backend split:

- `frontend/index.html` is the browser entry point.
- `frontend/app-shell.js` contains shared shell, route labels, legacy-compatible helpers, and the original screen contracts.
- `frontend/app-runtime.js` supplies the API-backed Goals 1–5 behavior.
- `frontend/team-chat-reports-agents.js` supplies Goals 6–8 behavior.
- `frontend/settings-system-enhancements.js` supplies Goal 9 Settings and Goal 10 search, notifications, audit, and quality behavior.
- `frontend/ui-foundation.*` owns tokens, icons, accessibility helpers, common states, and shared badge rendering.
- `backend/crm-api-server.js` owns authentication, sessions, role/team/ownership enforcement, API routes, and local demo collections.

Scripts load in order from `frontend/index.html`. Later runtime files intentionally extend the earlier contracts so the preview remains compatible with the original screen implementation while features are being migrated into a component framework.

## Request flow

```text
Browser screen
  -> apiFetch()
  -> HTTP-only aureum_session cookie
  -> backend requireAuth()/requireRole()
  -> role/team/ownership filter
  -> JSON response
  -> shared render/loading/error/empty state
```

## Adding a feature

1. Add or update the API route in `backend/crm-api-server.js`.
2. Apply authentication and the narrowest role/team/ownership predicate before returning data.
3. Add loading, error, empty, and success feedback to the matching frontend runtime module.
4. Use `AureumUI.escape()` for user-controlled text and `AureumUI.debounce()` for search input.
5. Add a smoke check to `scripts/api-smoke-test.ps1` when the feature changes access control.
6. Update the appropriate implementation status and blueprint documentation.

## Data persistence boundary

The local server uses in-memory Maps and arrays to make the preview portable. Production work should replace these collections with database repositories and migrations without changing the frontend API contracts. Audit and notification writes should become transactional with the business operation that creates them.
