# Workflow Acceptance And Known Gaps

Reviewed September 17, 2026. This replaces the earlier end-of-month checklist.
Use alongside [Developer Handoff](../DEVELOPER_HANDOFF.md), the
[architecture](architecture-and-data-ownership.md), and feature-specific contracts.

## Evidence And Test Boundaries

| Check | Evidence / limit |
| --- | --- |
| Production version and assets | Matched application SHA `7b8ebc6c0dc14edffccfb6a7199a00416065f64c` on September 17, 2026 |
| Automated suite | 2,614 tests in 232 files passed September 17, 2026 |
| Typecheck, build, release checks | Passed for that release September 16, 2026; not a new run for this documentation change |
| Latest action workflow | User reported action verified before requesting the planned/completed follow-on; not evidence that every live path below passed |
| This handoff pass | Documentation and source inspection, automated tests, and read-only deployment verification; no new live donor writes |
| External controls | Staging, branch protection, backup retention, restoration, and ownership transfer not verified by this pass |

Tests include API, calculation, concurrency, and real-component coverage, but
external services are mocked. The optional disposable-Postgres check exercises
specific activity-worker SQL, not every transaction. There is no checked-in general
browser E2E runner or CI workflow. Do not describe all of production as certified.

## Acceptance Matrix

Run the relevant rows for each change in a safe environment. Record date, build SHA,
actor role, workspace, synthetic fixture, expected result, observed result, and
evidence. Each row is a criterion to verify, not a claim of a new live test.

| Area / role | Expected result | Safety or failure check |
| --- | --- | --- |
| Sign-in / all roles | Approved active account enters the correct workspace | Inactive/uninvited users and invalid acting context do not acquire write access |
| Integration Health / Admin | Saved connections, cooldowns, refresh backlog, and reminder receipts show accurate guidance | Actual Admin required; no NXT calls, token renewal, job restarts, resends, or approvals; partial read failures stay unknown |
| Portfolio / MGO | Saved list appears without one full NXT fetch per card; search, grouping, paging, and detail expansion preserve scope | Unknown contacts/activity do not become false no-contact/no-gift claims; refresh failure retains saved data |
| Top Prospects / MGO | Drag, keyboard/fallback reorder, and rank persistence agree after reload | Inactive records do not corrupt active ordering; stale/concurrent edits are handled |
| Prospect detail / MGO | Correct constituent, opportunities, contact data, and saved pledge evidence appear | Opening a record does not create activity or a full-report refresh |
| Delegation / Admin | Edit the selected active MGO's authorized work; record Admin as actor and MGO as owner/credit target | Workspace switching cannot submit a stale draft into another workspace; no name-based fundraiser guessing |
| Acting view / Executive-only | Inspect permitted MGO data without write controls | Direct mutation requests are rejected, not merely hidden in the UI |
| Reminders / authorized owner or Admin | Create/edit, reschedule, complete, and reopen local follow-ups with version protection | No NXT write or discussion resolution from an app-only quick action; newer primary plan survives |
| Discussion / authorized participants | Correct topic, assignee, tags, and constituent links; create an additional next step when allowed | Additional reminder does not replace primary next step or widen discussion visibility |
| Planned NXT action / MGO or acting Admin | Explicit intent; today/future date; incomplete NXT action with correct constituent and fundraiser | No completed local activity, no automatic reminder completion, no repeat create from the same reminder |
| Completed NXT action / MGO or acting Admin | Explicit intent; nonfuture date; verified metadata and credit; optional guarded reminder completion | Consent starts unchecked; changed reminder blocks stale completion without losing the saved NXT action |
| Uncertain NXT action / same authorized workspace | Preserve receipt and returned ID; verify that exact action read-only | Double click, timeout, reload, and concurrent recovery cannot create a second action or duplicate local activity |
| Opportunity / authorized editor | Linked create/edit, stage, amount, dates, and FY rollover reflect the intended record | NXT failure is not reported as fully synced; local workflow status is not blindly applied to every NXT field |
| Prospect Pool / Admin or Advancement Services | Assignment and supported disposition/custom-field sync show truthful outcomes | Missing mapping or provider failure remains actionable; assignment alone is not proof of successful NXT sync |
| Standard import / authorized reviewer | Strong candidates are shown and can be opened/rejected; complete checks allow explicit new-record confirmation | Stale/reassigned Lookup ID, incomplete search, and rejected candidate do not authorize an unintended update |
| Quick creation / authorized reviewer | Complete clear-nonmatch checks permit approved safe additions; held rows do not stop unrelated safe rows | No automatic update of matched constituents; ambiguous creation outcome blocks repeat POST |
| Import recovery / authorized reviewer | Verify already-applied details without resending; preserve per-step checkpoints | Correct data already in NXT can finish verification; missing/incorrect values remain unresolved rather than blindly confirmed |
| Import history / authorized reviewer | Successful/failed outcomes are accessible from import navigation | Historical imports do not generate Work Queue approvals; unresolved current decisions remain in import review |
| Standings / permitted viewer | Current/prior YTD periods, attribution, rank ties, unknowns, and MGO dashboard projection agree | Failed refresh retains prior snapshot; repeated viewing/sorting does not rerun NXT |
| Pledge Payments / Admin or Advancement Services | Query-12033 boundary, fund descriptions, paid/balance/installments, and date ordering match fixtures | No all-pledges fallback scan; incomplete schedules do not become verified zero; resume uses saved checkpoint |
| Prospect pledge panel / MGO or permitted acting viewer | Authorized saved active-pledge totals and verification date appear | Expansion makes no NXT call; no access to another workspace's private pledge data |
| Top Prospect export / MGO | Own or authorized selected workspace; configured columns and saved values | Contacts opt-in; spreadsheet-formula neutralization; no NXT fetch |
| Master export / Admin or Advancement Services | Explicit selected MGO workspaces and labels | Direct requests cannot bypass role or scope checks; shared donors are not mistaken for unique revenue |
| Shared reports / permitted audiences | Published access follows configured audience; labels/formatting preserve intended values | Unselected users cannot fetch report data directly; Admin configuration access is not universal published-data access |

For UI changes, check desktop and narrow mobile layouts, keyboard operation,
focus on dialogs/errors, visible busy states, and preservation of failed drafts.
For performance work, measure saved first render and provider call counts using the
same synthetic portfolio size before and after; agree on numeric budgets before
claiming an improvement. Do not run production load tests or forced failures.

## Known Limits And Decisions

Priority here is a recommended handoff order, not a claim that work is approved.
Owner means a responsibility to assign; no named person has accepted it yet.

| Priority | Gap / decision | Owner role | Acceptance for follow-on work |
| --- | --- | --- | --- |
| 1 | Access and operational ownership | Institutional IT + product owner | Primary/backup owners and least-privilege access confirmed for GitHub, Vercel, Neon, Okta, Blackbaud, Resend, DNS, and saved queries |
| 1 | Reproducible isolated development | Lead developer + IT | Fresh checkout runs with synthetic data and no production credentials; setup tested by a second developer |
| 1 | NXT-write regression coverage | Lead developer + product owner | Duplicate/timeout/recovery and delegated attribution scenarios exercised with mocks; narrowly authorized live acceptance recorded separately |
| 1 | Metric meaning | Product owner | Decide completed-only HVA, per-MGO versus unique-gift aggregation, and appropriate use of local coverage |
| 1 | Backup/restore and rollback | Platform/database owner | Document retention and complete a disposable restore drill; separate app rollback from database/NXT recovery |
| 2 | Automated release gates | Lead developer | CI runs agreed tests/typecheck/build; branch controls and deployment source verified with owners |
| 2 | Browser lifecycle dependence | Lead developer | Inventory which import/pledge steps require an open page; define job ownership/recovery before changing execution model |
| 2 | Change-driven contacts/activity | Integration owner | Assess supported change notifications separately; preserve bounded fallback polling, cache scope, and rate limits |
| 2 | Institution-specific configuration | Product owner + lead developer | Inventory hardcoded FY/timezone/query/taxonomy rules; validate consumers before enabling another institution |
| 2 | Migration discipline | Database owner | Versioned forward migrations, staging validation, and recovery plan before structural schema work |
| 3 | Large modules / inconsistent write paths | Lead developer | Incremental extraction with behavior tests; no claim that all legacy writes have reminder-style durable receipts |
| Deferred | Family Import | Product owner | Separate design and acceptance before release; scaffold presence is not readiness |

Latest activity enrichment remains opt-in and budgeted; missing saved dates can
persist while a backlog is processed. Root and web deployment manifests differ,
so actual schedule selection must be verified. There is no implemented universal
NXT webhook invalidation or true organization-level multi-tenancy.

## Release Rule

Do not remove safeguards to make a demo pass. A provider timeout is not permission
to recreate a record; a saved receipt is not permission to mark every field verified.
Use the [release checklist](production-deploy-checklist.md), retain evidence, and
record unresolved limitations rather than silently widening scope.
