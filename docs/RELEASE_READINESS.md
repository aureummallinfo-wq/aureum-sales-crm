# Release Readiness

## Verified in the local preview

- JavaScript syntax checks pass for the backend and all frontend runtime modules.
- Login success/failure, session cookie, logout, and inactive-user rejection are implemented.
- Sales Agent is blocked from All Leads, Add Lead, Reports, Agents, and Settings.
- Sales Manager is blocked from Settings and scoped to team records.
- Settings APIs are Super Admin-only and return 403 to other roles.
- Search results are filtered by role and ownership.
- Notification list, unread count, read-one, and read-all flows are available.
- Security response headers and login attempt throttling are enabled for the local server.

## Required before production

- Replace in-memory data with migrations and a production database.
- Use a durable session store and rotate/secure secrets through environment variables.
- Add CSRF protection, strict CORS policy, structured logging, and centralized request validation.
- Add persistent audit/activity and notification storage with retention rules.
- Add server-side pagination to every large table and database indexes from the blueprint.
- Replace attachment metadata with validated multipart uploads and private object storage.
- Replace polling with authenticated WebSocket/SSE delivery where real-time updates are required.
- Connect real PDF/XLSX generators and verify downloaded files in CI.
- Add automated browser tests for each role and every acceptance checklist item.
- Deploy only behind HTTPS with backups, monitoring, health checks, and rollback support.
