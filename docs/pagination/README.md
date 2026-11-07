# Aureum Sales CRM — Reusable Pagination Kit

**Status: tested foundation, NOT yet an integrated CRM feature.** Read `docs/pagination/INTEGRATION_GUIDE.md` before wiring it into screens or API routes.

Run tests from the repository root:

```bash
node --test src/tests/unit/pagination/pagination.test.js
```

This branch adds:

- `backend/pagination.js`: validated page parameters, permission-scoped SQL COUNT/LIMIT/OFFSET helper, stable metadata.
- `frontend/shared/pagination.js`: accessible first/previous/numbered/next/last controls, selectable page size and page jump.
- `frontend/shared/pagination.css`: responsive Aureum styling.
- `src/tests/unit/pagination/pagination.test.js`: seven Node unit tests.
- `docs/pagination/demo.html`: local static UI demonstration with simulated records.

**Not yet included:** route wiring, paginated SQL in current repository methods, KPI-safe response handling, list screen integration, full application regression tests.

No migrations or production DB changes are part of this foundation. The feature branch is not approved for a production deployment.
