# Smoke Test Checklist

| ID | Area | Check | Expected Result | Status |
| --- | --- | --- | --- | --- |
| SM-001 | Startup | Run `npm start` | Server listens on `http://127.0.0.1:4173` | Ready |
| SM-002 | Syntax | Run `npm run check` | All checked JS files parse successfully | Passed |
| SM-003 | Tests | Run `npm test` | Unit, functional, and E2E tests pass | Passed |
| SM-004 | QA audit | Run `npm run qa` | API smoke and security audit pass | Passed |
| SM-005 | Auth | Login as all demo roles | Dashboard loads for each role | Covered |
| SM-006 | Logout | Logout after login | Session cookie is cleared | Covered |
| SM-007 | Sidebar | Verify role navigation | Restricted menu items hidden | Covered |
| SM-008 | Settings | Open as manager/agent | Access denied/API 403 | Covered |
| SM-009 | Webhook | Submit without secret | Request rejected with 401 | Covered |
| SM-010 | Static files | Request backend source path | Backend source is not served | Covered |
