# Meta Intake — Browser-Based QA Analysis

**Date:** 24 November 2026  
**Environment:** live authenticated CRM browser session  
**Route:** `https://crm.aureummall.info/meta-inbox`  
**Role observed:** Waqas — Super Admin  
**Viewport:** approximately 1265 × 710 desktop browser viewport  
**Test type:** browser-based visual, accessibility, interaction, data-state, and workflow QA.

## 1. QA scope

This review was performed against the actual browser screen. It covers:

- Meta Intake page shell and navigation.
- Loading and populated data states.
- KPI cards and staging queue.
- Search, source, status, interest, date, and clear controls.
- Table readability and data mapping.
- Meta lead detail drawer.
- Drawer overlay, scrollbar behavior, close behavior, and review workflow controls.
- Light-theme visual consistency and alignment.

No lead was approved, sent to CRM, rejected, edited, or otherwise mutated during the test.

## 2. Live browser observations

| Area | Browser observation | Result |
|---|---|---|
| Page load | First state briefly showed `0 visible` and all KPIs as zero while the page still said `Loading Meta intake records.` | PARTIAL |
| Loaded queue | After loading completed, the page showed 43 visible records, 43 pending review, 0 sent to CRM, 0 ready for Meta, and 22 needing correction. | PASS |
| Data freshness | Latest visible lead was received on 24 Nov 2026 at 16:56. | PASS |
| Navigation | Sidebar and breadcrumb identify Meta Intake correctly. | PASS |
| Filters | Source, review status, interested property, date from, date to, and Clear are available. | PASS |
| Table | Lead ID, received time, contact, source, property, purpose, budget, payment, attribution, status, and action are exposed. | PASS |
| Detail drawer open | View details opened the Ghulam Abbas drawer successfully. | PASS |
| Detail drawer close | Close details removed the drawer and its accessibility nodes successfully. | PASS |
| Review controls | Review status, outcome, review notes, original payload, Save review, and Approve & send to CRM are available. | PASS |
| Production styling | Detail fields still appeared as large grey cards in the live browser. | FAIL |

## 3. Goal-based QA

| Goal | Status | Finding |
|---|---|---|
| Understand the queue | PARTIAL | The page purpose and staging explanation are clear, but the initial zero state can look like an empty queue before data arrives. |
| Identify urgent work | PASS | Pending review and Needs correction KPI cards make review workload visible. |
| Find a specific lead | PASS | Search and multiple filters cover contact, source, status, property, and date. |
| Review a lead safely | PASS | Detail drawer separates contact, qualification, attribution, processing, and decision sections. |
| Make a review decision | PASS* | Decision controls are visible; mutation was not submitted against live data. |
| Preserve Meta reconciliation | PASS | Internal CRM ID, Meta Lead ID, campaign data, ad set, form, platform, timestamps, and raw payload access are exposed. |
| Maintain the Light theme | FAIL | Read-only fields use dark-theme hard-coded colors and look disabled/unfinished. |
| Keep focus on the drawer | PARTIAL | Backdrop focus is good, but the live screenshot showed an additional underlying page scrollbar. |

`*` Control presence and accessibility were tested; actual save/send behavior requires an approved QA record or staging fixture.

## 4. Section-by-section analysis

### 4.1 Page header

**Observed:** `Meta Intake`, supporting description, and Refresh action.

**Result:** PASS.

The heading communicates the workflow: review Meta leads, add the business outcome, and send approved records into CRM. The header follows the general CRM page pattern and is visually consistent with the rest of the application.

### 4.2 KPI cards

**Observed populated state:**

- Pending review: 43.
- Sent to CRM: 0.
- Ready for Meta: 0.
- Needs correction: 22.

**Result:** PASS after loading, PARTIAL during loading.

The labels are understandable and operationally useful. However, counters are derived from the currently loaded `items` array and initially render as zero before the API response has completed. This can be mistaken for a genuine empty state.

**Recommendation:** show skeleton KPI cards or an explicit loading state instead of numeric zero values until the queue response is complete.

### 4.3 Review-before-CRM staging card

**Observed copy:** Raw Meta data is retained for reconciliation; internal notes stay in CRM; approved outcome signals are intended for a later Conversions API step.

**Result:** PASS.

This is useful operational guidance and correctly distinguishes review from CRM delivery.

### 4.4 Filters

**Observed controls:**

- Free-text search.
- All sources / Meta Lead Ads / Messenger / Instagram / website / WhatsApp / referral / manual / import / QR.
- All review statuses / Pending review / Reviewed / Sent to CRM / Rejected / Failed.
- All interests / Studio / 1-Bed Apartment / 2-Bed Apartment / Commercial Shop / Corporate Office / Food Court Space.
- Date from and date to.
- Clear.

**Result:** PASS for control discovery and accessibility.

**Further mutation tests required:** verify that each filter updates records, preserves other filter selections, handles an empty result, and that Clear restores the full queue without stale counts.

### 4.5 Staging table

**Observed columns:** Lead ID, Received, Lead / Contact, Source, Interested Property, Purpose, Budget, Payment, Attribution, Status, Action.

**Result:** PASS for structure, PARTIAL for data normalization.

The table exposes useful raw campaign data. However, several values are still technical raw payload values, for example `residential`, `1_bedroom`, `rental_income`, `under_10_lac`, and `food_court_shop`. These should be displayed as human-readable values in the primary workflow while preserving the raw value in the original payload section.

Recommended presentation mappings include:

| Raw value | User-facing label |
|---|---|
| `1_bedroom` | 1-Bed Apartment |
| `2_bedroom` | 2-Bed Apartment |
| `food_court_shop` | Food Court Shop |
| `rental_income` | Rental income |
| `living_with_family` | Living with family |
| `under_10_lac` | Under PKR 10 lac |
| `25_lac+` | PKR 25 lac+ |

### 4.6 Detail drawer shell

**Observed:** right-side drawer, dark blurred backdrop, close button, lead name, review status, and source.

**Result:** PARTIAL.

The drawer hierarchy is good and the close control works. The dark backdrop is a valid modal pattern, but the combination of dark overlay, blur, and visible underlying scrollbar makes the page feel heavier than necessary. The background should be visually inactive and non-scrollable while the drawer is open.

### 4.7 Lead & contact

**Observed fields:** Internal CRM ID, Meta Lead ID, Full name, Phone number, WhatsApp number, Email, City, Country, Area / address, Active contact, Consent.

**Result:** PARTIAL / P1 visual defect.

The information hierarchy is correct. The defect is the presentation: read-only cards are grey with hard-coded dark-theme styling. In Light mode they look like disabled form controls rather than clean information cards. Missing values shown as `-` are acceptable, but their visual treatment should be softer and clearer.

### 4.8 Customer qualification

**Observed fields:** Interested in, Property type, Commercial property type, Residential budget, Commercial budget, Purpose of investment, Commercial purpose, Investment type, Down payment, Preferred contact, Payment preference, Purchase timeline, Site visit interest.

**Result:** PARTIAL.

The conditional-field model is well structured and the explanatory hint is useful. The same grey-card theme defect affects every field. Empty conditional fields should use a subtle neutral empty value such as `Not captured` or `Not provided`, with consistent wording across the CRM.

### 4.9 Meta attribution

**Observed fields:** Source, Medium, Campaign name, Campaign ID, Ad set name, Ad set ID, Ad name, Ad ID, Form name, Form ID, Page ID, Platform.

**Result:** PASS for information architecture; PARTIAL for visual consistency.

The section provides the right reconciliation information and correctly shows names before IDs. Missing IDs are exposed as `-`, which is appropriate if the raw payload remains available.

### 4.10 CRM processing

**Observed fields:** Not queued, review status, CRM status, CRM lead ID, ingested via, reviewed by, reviewed at, received at, last updated.

**Result:** PASS.

This section makes the delivery state understandable. The current lead was `Pending review`, `Not sent`, and ingested via `zapier`.

### 4.11 Review decision

**Observed controls:** Review status, Outcome for Meta, Review notes, View original Meta payload, Save review, Approve & send to CRM.

**Result:** PASS for control visibility; NOT EXECUTED for live mutation.

The workflow controls are correctly placed at the end of the drawer. The warning that internal notes are never sent to Meta is important and should remain prominent.

## 5. Defect register

| ID | Priority | Status | Description | Acceptance criteria |
|---|---:|---|---|---|
| META-QA-001 | P1 | Open in production | Light-theme detail cards use dark hard-coded backgrounds and light text, producing grey disabled-looking fields. | In Light mode, all read-only detail cards use white/ivory surfaces, `var(--line)` borders, `var(--ink)` values, and `var(--muted)` labels. |
| META-QA-002 | P1 | Open in production | Initial KPI and queue state shows numeric zeros before data loading completes. | While loading, show skeletons or a clear loading label; do not present zero as a confirmed business count. |
| META-QA-003 | P2 | Open in production | Underlying page scrollbar remains visible alongside drawer scrollbar. | Opening the drawer locks the page behind it; only the drawer scrolls. Closing restores page scrolling. |
| META-QA-004 | P2 | Open in production | Raw payload values are exposed in the primary table. | Map common enum values to business labels; preserve raw values in the original payload. |
| META-QA-005 | P2 | Review | Backdrop is visually heavy at the observed desktop viewport. | Keep focus clear while reducing the overlay/blur enough that the app still feels responsive and premium. |
| META-QA-006 | P2 | Not executed | Save review and Approve & send to CRM mutations were not run against live records. | Use a QA fixture and verify status changes, CRM lead creation, duplicate prevention, and error recovery. |

## 6. Recommended acceptance tests

### Visual acceptance

1. Open Meta Intake in Light mode.
2. Open any pending lead.
3. Confirm all detail cards are white/ivory, not grey.
4. Confirm label/value contrast is clear.
5. Confirm only the drawer has a scrollbar.
6. Confirm the backdrop does not allow interaction with the table behind it.
7. Close the drawer and confirm the queue scroll position is preserved.

### Data-state acceptance

1. Hard refresh Meta Intake.
2. Confirm the first visible state is a loading skeleton or loading label.
3. Confirm KPI cards do not briefly report false zero values.
4. Confirm the loaded count matches the table count.
5. Refresh again and confirm the result is repeatable.

### Review workflow acceptance

1. Open a QA fixture with missing phone and missing qualification values.
2. Set Review status to Reviewed.
3. Select an Outcome for Meta.
4. Add an internal note.
5. Save review.
6. Confirm the drawer shows the updated reviewer, timestamp, status, and outcome.
7. Confirm the internal note is not sent to Meta.
8. Approve and send only a reviewed fixture.
9. Confirm exactly one CRM lead is created and duplicate approval is blocked.

## 7. QA disposition

**Current browser disposition: CONDITIONAL PASS for workflow structure, FAIL for Light-theme visual consistency.**

The Meta Intake workflow is structurally strong: the queue, filters, detail sections, attribution data, processing state, and review controls are all present and understandable. The production screen should not receive final UI sign-off until the P1 Light-theme and loading-state issues are deployed and re-tested.

The local CSS and scroll-lock fixes have been prepared in the workspace, but they are not yet deployed to `crm.aureummall.info`.
