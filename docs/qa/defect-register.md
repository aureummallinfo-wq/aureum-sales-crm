# Aureum Sales CRM Defect Register

Date: 2026-10-09
Version: 1.0.0
QA phase: Final SQA, security verification, smoke testing, and handover readiness.

## Current Defect Summary

| Severity | Open | In Review | Ready for Fix | Fixed | Closed | Deferred |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Critical | 0 | 0 | 0 | 0 | 0 | 0 |
| High | 0 | 0 | 0 | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 | 0 | 0 | 1 |
| Low | 0 | 0 | 0 | 0 | 0 | 0 |

## Active Defects

No open Critical or High defects were identified by the automated QA gates executed for this pass.

| Defect ID | Module | Screen | Role | Browser | Viewport | Severity | Priority | Steps to Reproduce | Expected Result | Actual Result | Screenshot/Video Placeholder | Root Cause Placeholder | Recommended Fix | Status | Owner Placeholder | Retest Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DFR-001 | Global UI | All major CRM screens | All roles | Chrome, Edge, Firefox | 375x812, 430x932, 768x1024, 1366x768, 1440x900, 1920x1080 | Medium | P2 | Complete manual device/browser screenshot pass before production go-live. | Target client devices confirm no viewport-specific overlap or clipping. | Automated route/static/browser-smoke checks passed; full manual screenshot certification remains a release activity. | Add screenshots during final UAT. | Browser/device matrix not fully represented by automated Node smoke tests. | Execute manual cross-browser visual QA during final UAT; close after screenshots are attached. | Deferred | QA / Client UAT | Pending final UAT |

## Defect Intake Template

Use this template for any issue found during manual UAT or future automated runs.

| Field | Value |
| --- | --- |
| Defect ID | DFR-### |
| Module |  |
| Screen |  |
| Role |  |
| Browser |  |
| Viewport |  |
| Severity | Critical / High / Medium / Low |
| Priority | P0 / P1 / P2 / P3 |
| Steps to Reproduce |  |
| Expected Result |  |
| Actual Result |  |
| Screenshot/Video Placeholder |  |
| Root Cause Placeholder |  |
| Recommended Fix |  |
| Status | Open / In Review / Ready for Fix / Fixed / Retest Failed / Closed / Deferred |
| Owner Placeholder |  |
| Retest Result |  |

## Severity Rules

- Critical: Data leakage, authentication bypass, role bypass, app crash, password/security issue, or webhook secret exposure.
- High: Broken main workflow, broken save action, wrong data scoping, broken form submission, or broken route guard.
- Medium: UI issue affecting usability, visual overlap, broken empty state, or minor filter issue.
- Low: Small spacing, copy, icon, or polish issue.

## QA Authority Boundary

Defects are documented before fixes. Critical and High fixes require a failing test or reproduction, severity classification, expected-versus-actual behavior, and explicit fix authorization unless there is an emergency security exception.
