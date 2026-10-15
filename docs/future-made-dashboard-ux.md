# Future. Made. Dashboard UX

## Scope

Implemented 2026-10-15, not deployed. This is the first visual simplification
pass (recommendations 1 and 3), not a change to campaign accounting or refresh
behavior.

- Committed, Received to date, and Outstanding pledges lead the saved report.
  Outstanding pledges uses the existing verified balance value, never a new
  calculation or a guessed zero.
- The compact report header retains authorized report navigation and the
  dashboard switcher under Reports & dashboards. Other reports retain their
  existing header by default.
- Manage dashboard groups fund assignments, source settings, write-offs,
  classification settings, refresh controls, and viewer management. It is only
  available to existing campaign managers. First-time source setup opens it;
  configured dashboards start with it collapsed.
- Closing management hides rather than unmounts its editors, preserving drafts
  and fund selections. The close control returns keyboard focus to the toggle.
  User-started refresh continuation stays at page level and is not paused or
  restarted by opening or closing the panel.
- Source-change warnings, changed exceptions, active refresh notices, and
  refresh errors remain visible outside the collapsed controls.
- How these totals are calculated retains reconciliation, CSV source dates,
  classification methodology, and orphaned-exception explanations. The repeated
  recognition hero and category-total footer are removed. Legacy snapshots
  without configured revenue metrics still show their saved recognition total.

No API, schema, query, permissions, calculation, assignment, financial import,
or NXT behavior changes. Gift-detail filters remain scoped to gift detail;
overall, fiscal-year, and pillar totals remain independent. Charts, new global
filters, abbreviated currency, and presentation/print mode are deferred.

## Verification

- UI tests cover management visibility and draft preservation, first-time
  setup, read-only access, keyboard focus return, visible refresh failures,
  optional compact report navigation, category reconciliation, and missing
  versus verified zero balance data.
- Full regression: 6,825 passed, 192 existing opt-in/external-service tests
  skipped. All 74 campaign PostgreSQL integration tests ran using PGlite.
- Typecheck and production build passed.
- Actual React source was inspected in a loopback-only fictional-data preview,
  including desktop and 390px mobile. No horizontal page overflow at 390px;
  management controls remain usable and read-only viewers cannot access them.
- Preview data cannot submit changes or call live services. No live campaign
  settings, records, or deployment were changed for this work.

Local verification artifacts use `/private/tmp/ju-campaign-ux-*`.
