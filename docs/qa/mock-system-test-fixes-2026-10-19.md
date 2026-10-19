# Mock test fixes — 19 October 2026

All six items in the original mock-test report have been addressed. Changes were checked with isolated local data and the PostgreSQL-compatible PGlite database. Hosted production/Neon was not exercised.

| Finding | Result | Change and verification |
|---|---|---|
| MOCK-01: refresh logs out | Fixed | Startup shares one promise across runtime modules. Manager and agent can refresh My Account and remain signed in; the agent can also refresh Tasks with its saved state. |
| MOCK-02: empty advisor dropdown | Fixed | Add New Lead renders the cached active advisor options on every redraw. Browser created a lead directly assigned to Adan. |
| MOCK-03: customer interest cleared | Fixed | Customer edit preserves existing values that are absent from the standard dropdown, including custom interests. Commercial stays selected after a property-type edit. Opening Edit no longer reloads the current customer and replaces the new form. |
| MOCK-04: rejected profile changes still save | Fixed | Both account profile endpoints validate a proposed patch before changing saved values. Tests cover both roles and invalid combined name/phone edits, followed by a valid update. |
| MOCK-05: logout token replay | Fixed | The local backend records hashed revoked tokens, expires the cookie and preserves independent sessions. Revocations join the local JSON snapshot when persistence is enabled. Replaying a logged-out token returns 401; a new sign-in still works. |
| MOCK-06: Tasks missing locally | Fixed | Local Tasks now use the existing relational API validation/permissions with a local task repository. Manager assignment, filtering, linked records, agent completion/reopening, reassignment, deletion and notifications are covered. Local JSON persistence includes tasks when enabled. |

## Verification

- `npm run test:mock`: 112 passed, 0 failed, 0 blocked.
- Targeted browser retest: six checks passed; no browser console errors observed.
- Added regression tests cover startup deduplication, cached advisors, custom/empty interests, edit-form loading, atomic profile changes, logout token revocation and local Tasks permissions/lifecycle.
- Syntax checks passed. Full regression suite: 142 passed, 0 failed, 1 hosted Neon readiness check skipped. Execution log: `output/fix-regression-console.txt`.

Generated evidence is local: `output/mock-defect-retest-2026-10-19.json`, `output/fixed-customer-interest.png`, `output/fixed-agent-tasks.png` and the regenerated `output/mock-system-test-report.html`.

Lead Import's browser flow still needs a database-backed development server; its real SQL/API mock tests pass. Production backups, alert configuration, deployment connectivity and load capacity need separate operational checks. See [performance and recovery priorities](../production/performance-reliability-plan.md).
