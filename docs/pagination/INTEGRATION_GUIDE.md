# Aureum Sales CRM — Pagination Integration Guide

**Current status: reusable code and unit tests only.** The feature branch contains the pagination foundation but is not connected to existing CRM list routes or screens. Do not confuse a successful helper test with working pagination in the live CRM.

## Included files

- `backend/pagination.js`: validates optional `page` and `pageSize`, builds parameterized `LIMIT/OFFSET` with a permission-scoped `COUNT(*)`, and formats pagination metadata.
- `frontend/shared/pagination.js`: accessible pager rendering and event delegation.
- `frontend/shared/pagination.css`: responsive Aureum-themed controls.
- `src/tests/unit/pagination/pagination.test.js`: seven Node unit tests.
- `docs/pagination/demo.html`: static local demonstration with simulated records; it does not load CRM customer data.

## 1. Backend integration

Inspect `backend/db/neon-repository.js`, `backend/db/relational-api.js`, and `backend/crm-api-server.js`.

Add optional `page` and `pageSize` query parameters to the list APIs. When neither parameter is present, preserve the existing response and full-array behavior for dashboards, exports, sidebar counts, task linking, agent details, and other consumers. When parameters are present, return the paged `data` array plus:

```json
{
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 4538,
    "totalPages": 182,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

**Do not page in JavaScript with `.slice()` after fetching all records.** For Leads, Customers, and Tasks, refactor existing repository methods or add paged versions. Reuse the same authorization and filtering conditions for SQL count and SQL rows. Apply `scope(...)` or `taskScope(...)` in both. Never expose team- or agent-excluded counts.

- Validate inputs with `parsePagination`; return HTTP 400 for `PaginationValidationError`.
- Use parameterized `LIMIT` and `OFFSET` and fixed SQL fragments; never interpolate user-controlled sort or table names.
- Deterministic order: Leads `l.created_at DESC, l.id DESC`; Customers `c.created_at DESC, c.id DESC`; Tasks preserve priority/due ordering and append unique `t.id DESC`.
- Tests must cover team/agent ownership, filters, page boundaries and changing records.
- Consider `COUNT(DISTINCT id)` if added joins can multiply rows.
- Add equivalent behavior to the local/test fallback routes in `backend/crm-api-server.js` without conflating them with production PostgreSQL pagination.

Example integration pseudocode:

```js
const pagination = parsePagination(url.searchParams);
if (!pagination) {
  const records = await repository.listLeads(options);
  return json(res, 200, { data: records.map(leadView) });
}
const { rows, meta } = await repository.listLeadsPage({ ...options, pagination });
return json(res, 200, { data: rows.map(leadView), meta });
```

### Special case: Follow-ups

Preserve `uniqueFollowUps`, active/closed suppression, and date-filter behavior. The current list deduplicates records after querying and may emit notifications. Applying `LIMIT/OFFSET` to raw follow-up rows **before deduplication** causes incorrect totals and possible missing follow-ups. Use a permission-scoped deduplicated query or a window function; keep notification creation independent of mere page navigation.

## 2. Frontend integration

Inspect `frontend/features/leads/leads-module.js`, `frontend/features/customers/customers-module.js`, `frontend/features/follow-ups/followups-module.js`, `frontend/features/tasks/tasks-module.js`, `frontend/app-shell.js`, and the theme CSS.

Add the shared assets in `frontend/index.html` so the JS module loads before its consumers:

```html
<link rel="stylesheet" href="/shared/pagination.css" />
<script src="/shared/pagination.js" defer></script>
```

Each paged screen must maintain a distinct page state: `page`, `pageSize`, server `total`, filters, loading, and a request-generation token. Use the existing `default_table_page_size` preference when available; allowed sizes are 10, 25, 50, 100 and default is 25.

- Fetch only the selected page from the database and display the total from `result.meta.total`, not `result.data.length`.
- Render the component after each table, e.g. `AureumPagination.render(meta, 'leads')`. Bind `AureumPagination.attach` once to a stable ancestor and request the new page in its change callback.
- Reset to page 1 when filters/search/page size change. Debounce search and ignore stale responses.
- Include first/previous/numbered/next/last and Go to page, accessible labels and keyboard navigation.
- The lead and customer summary cards currently count loaded arrays; replace with permission-scoped aggregate results. A current-page subset must not silently become a total KPI.
- Sidebar badges currently observe full-list responses. Never substitute the current page for unread/overdue totals; use dedicated count APIs or keep an explicit full-scope count pathway.
- Lead Select All must select only the rows of the current page. Preserve selected IDs across pages only when explicit and predictable; bulk actions must never implicitly include other matching records.
- Full filtered CSV/Excel export must remain available through a separate authorized export route, not the current page alone.
- Task creation currently downloads all leads, customers, and follow-ups for dropdown options. Replace with searchable, permission-scoped linked-record selectors, or pagination will not fix the task screen's large secondary requests.
- Keep detail drawers, lead assignment, editable notes, status updates, reports, dashboard, calendar and role permissions intact.

## 3. Safety, verification and rollout

1. Continue on the existing `feat/crm-pagination-foundation-20261107` branch or a new integration branch; do not overwrite the separate old local Sales CRM folder.
2. Do not run production database migrations, edit records, deploy to VPS or merge into `main` without approval.
3. Run `node --test src/tests/unit/pagination/pagination.test.js`, then the full repository `pnpm check` and `pnpm test` after integration, with production credentials absent.
4. Test 0, 1, 25, 26, 100 and 4,538 records; filters, search, stable sort, page size, last-page shrink, stale response suppression, role/team isolation, bulk selection, export, sidebar badges and summary KPIs.
5. Test follow-up deduplication and no repeated notification side effects.
6. Test Vercel previews against a development-only database. Automatic VPS deployment is intentionally disabled in `.github/workflows/deploy-production.yml`; keep it disabled. Use a separately reviewed migration-free procedure for any production rollout.

## Known limitations

These tests exercise pure helpers and simulated SQL. They do **not** connect to production PostgreSQL or prove that live All Leads, My Leads, Customers, Follow-ups or Tasks tables are paginated. Full integration, tests, and deployment remain outstanding.
