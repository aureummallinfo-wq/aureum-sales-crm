# Aureum Sales CRM Final QA Test Plan

Date: 2026-10-09
Version: 1.0.0
Scope: Final SQA, smoke testing, functional testing, unit testing, browser QA, security testing, and client handover readiness.

## Objectives

- Verify the final role model: `super_admin`, `sales_manager`, and `sales_agent`.
- Verify route protection, API authorization, object-level ownership, team scoping, webhook secret protection, temporary-password onboarding, and safe error handling.
- Verify the core CRM modules: Authentication, Dashboard, Leads, Customers, Follow-ups, Team Chat, Reports, Users, Settings, My Account, and Webhooks.
- Verify the Aureum UI foundation for responsive layout, typography consistency, drawers, forms, tables, filters, and browser smoke.

## Automated Gates

- `npm run check`: JavaScript syntax gate for backend, API, and frontend runtime files.
- `npm test`: Unit, functional, browser-smoke, and E2E regression tests.
- `npm run qa`: API smoke checks plus final security audit.

## Current Execution Status

- `npm run check`: Passed.
- `npm test`: Passed, 57 automated tests.
- `npm run qa`: Passed.

## Official Final QA Test Count

Unit Test Cases:
UT-001 through UT-020 = 20 tests

Functional Test Cases:
FT-001 through FT-030 = 30 tests

Browser Smoke / Visual QA Test Cases:
BS-001 through BS-020 = 20 tests

Total:
20 + 30 + 20 = 70 tests

Status:
Reconciled and verified.

## Test Case Sources

- Unit test cases: `docs/qa/unit-test-cases.md`
- Functional test cases: `docs/qa/functional-test-cases.md`
- Browser smoke / visual QA test cases: `docs/qa/browser-qa-checklist.md`
- Security QA checklist: `docs/qa/security-test-cases.md`
- Defect register: `docs/qa/defect-register.md`
- Execution evidence: `docs/qa/test-execution-report.md`

## Exit Criteria

- No known Critical or High authorization defects.
- Sales Agent cannot access restricted routes, APIs, or another agent's owned records.
- Sales Manager cannot access Settings or another team's reporting scope.
- Super Admin can access all final administrative surfaces.
- Webhook secrets are masked after creation and validated for public inbound requests.
- Final QA documentation and handover checklist are present in `docs/qa`.
