# Workflow UX Consistency

Roadmap step 4, deployed September 17, 2026 as
`9b7b9af62170d996eac88220a3d3e7ecdff04ca9`, Vercel deployment
`dpl_EVfY1ECnqQaDQ6RG2fm2T2Z5tMGG`. Production SHA and assets were verified.
This is a bounded presentation and draft-safety pass, not a complete accessibility
audit or a redesign of all legacy forms.

## Truthful Outcomes

`WorkflowNotice` provides a shared status region for the touched workflows:

| Label | Evidence required |
| --- | --- |
| Saved in app | Successful local next-step or discussion save; explicitly not an NXT action |
| Sent to NXT | Applied import row without complete read-back verification |
| Verified in NXT | Durable action receipt in `saved` state, or the existing complete import-verification predicate |
| Needs verification | Uncertain/review action receipt or attempted import requiring verification |
| Submission pending | Processing action receipt or Applying import row |
| Saved status | Neutral general guidance; message wording alone cannot imply successful NXT verification |

Next Steps no longer gives an uncertain NXT receipt a green success notice.
Action IDs and detailed import send/verification history are collapsed using native
`details`/`summary`; recovery buttons and unresolved warnings remain visible.
Saving, verification, permissions, duplicate prevention, receipt claiming, and
retry rules are unchanged. No new polling or NXT requests were added.

## Draft Boundaries

- Import file replacement, clearing, and user-selected saved-run switching check
  unsaved review/correction/CSV state. Active import operations block replacement.
  Internal recovery reloads still use the existing saved-run loader.
- Both React file events and the native fallback use current guard state; one
  File object is read once. Cancelling replacement retains the existing workspace.
- Potential-new import rows now have the page-level dirty-review flag used by
  quick creation. Previously that reference existed only inside the row loop and
  could throw when the quick-creation controls rendered.
- A prospect next-step draft survives switching to another modal panel. Closing
  or cancelling asks before discarding edits. Portfolio follow-up drafts also warn
  before a page unload, in addition to their existing modal-close guard.
- Discussion editing guards Open/Resolved, editing another item, cancellation,
  and switching to Assigned to me when it would hide the editor. Harmless
  grouping changes keep the draft. Failed saves show an error and retain inputs.
- Discussion fields are disabled during their save. Hiding the new-item composer
  is explicitly labeled "Hide and keep draft" and explains how to resume.

Drafts remain component memory only: no donor content is added to localStorage or
sessionStorage. The new unload hook warns on supported browser reload/close/full
navigation; it is not a global SPA-navigation blocker or durable draft recovery.
Browser crashes, forced termination, permission changes, or other component
unmounts can still lose unsaved work. Unrelated legacy opportunity/action editors
have not been migrated. A future global guard should cover routing and workspace
ownership deliberately, not persist sensitive drafts by default.

## Accessibility And Verification

The touched notices use status regions; mutation errors use alerts. Existing action
dialog outcome focus is preserved. Technical summaries and touched modal/recovery
buttons have 44px minimum targets. Discussion grids can shrink below 200px without
forcing mobile overflow, and view/composer buttons expose selected/expanded state.
An empty Next Steps search offers a local Clear search control without refetching.

Regression coverage includes receipt labels, no false verified state, collapsed
details, focused feedback, local search clearing, declined discard prompts,
hidden and failed-save drafts, pending-field disabling, current native file guards,
and rendering quick creation for potential-new constituents.

Local verification: 2,663 tests in 237 files, typecheck, and production build pass.
Actual components were exercised with synthetic responses and the built stylesheet
at desktop and 390px widths. The composer and action dialog had no horizontal
overflow; keyboard activation opened technical details and Escape closed the
native dialog. A signed-in, read-only production smoke check verified the
Next Steps page and Clear search behavior after deployment. No live import,
settings mutation, or NXT mutation was made; this was not full live acceptance
of every workflow.

See [workflow acceptance](mgo-workflow-readiness.md) for the broader release checks.

## Home And Navigation Entry Paths (September 19, 2026)

Home and the main navigation now promote the same three destinations in a
"Start here" section, using the existing role-filtered navigation definitions:

- Fundraiser view: My Prospects, Follow-ups & Discussion, My Reports.
- Advancement Services view: Work Queue, Constituency Import, Top Prospect Exports.

Promoted cards are not repeated in the lower Home groups or other menu sections.
The fundraiser's Attention & Upcoming section follows the primary cards and keeps
its contextual follow-up links. All other tools remain accessible; existing
workspace controls, terminology, and Family Import are unchanged. Two-card
supporting groups use the full desktop row; primary cards stack on mobile.

This is presentation-only. No new data requests, polling, prefetching, background
checks, permissions, or NXT writes were introduced. Queue badges still use the
existing worklist counts, imports have no queue badges, and queue-refresh failures
retain their visible warning. Home shortcuts and navigation share `primaryOrder`
metadata in `appNavigation.js` rather than separate role-specific destination lists.

Verification: 3,061 tests in 266 files, typecheck, production build, and release
worktree checks passed. Tests cover role-specific order, unique destinations,
permissions, active menu links, existing attention links and badge behavior, and
no additional fetching. Actual Home and AppShell components were checked with
synthetic data at desktop and 390px mobile widths: no horizontal overflow, equal
desktop card sizes, correct menu order, and visible keyboard focus. This is local
verification, not a deployment or a live NXT workflow acceptance test.

## Compact Home Workspace Controls (September 19, 2026)

The Admin-only Home workspace switcher is now a collapsed native disclosure above
Start here. Its summary always identifies the current view and, in MGO view, the
confirmed selected workspace. Expanding it reveals the existing view buttons and
workspace selector. The selected view is disabled so clicking it cannot reset an
acting workspace. My workspace remains the explicit return-to-self option.

Admin action attribution stays visible outside the disclosure when working in an
MGO workspace. The existing edit-permission helper determines whether the notice
describes editing or read-only viewing. An unresolved workspace is labeled as
loading or unavailable, never assumed to be My workspace. A failed workspace read
shows a visible warning even while collapsed; unavailable selectors are disabled.

No endpoints, cache keys, query enablement, refresh schedules, NXT writes, or
authorization rules changed. Expanding/collapsing the controls is local browser
behavior and triggers no request. Existing workspace-switch handlers are reused,
and their feedback is now announced through a status region. Non-Admin Home views
and the persistent account-menu controls are unchanged.

Verification: 3,087 tests in 267 files, typecheck, production build, and release
worktree checks passed. New coverage includes collapsed controls, combined Admin
roles, editing versus read-only context, unverified/loading/error states, original
selector eligibility, callbacks, failed-switch feedback, unchanged query
enablement, and no reads from disclosure interaction. Actual Home components were
checked with synthetic data at desktop and 390px mobile widths, including keyboard
expansion/collapse, visible attribution, and no horizontal overflow. No production
workspace was switched and no live NXT operation was performed during verification.

## Configured Home Role Labels (September 19, 2026)

Home now uses the existing organization terminology context for workspace titles,
signed-in role labels, compact view controls, leadership selector labels, and
request descriptions. Prospect Pool, Top Prospect Exports, and List Request Queue
descriptions share configured fundraiser copy through the navigation metadata.
No custom title is automatically pluralized, and person names are not rewritten.
Blank or unavailable settings retain existing defaults; no automatic switch from
MGO to Fundraiser was made. Long titles wrap on mobile.

This adds no settings requests, polling, background jobs, NXT calls, or writes.
Existing role IDs, routes, query keys, permissions, and workspace-switch payloads
remain unchanged. Labels update without resetting the selected workspace or its
open disclosure. Admin attribution and read-only notices remain visible.

Verification: 3,097 tests in 267 files, typecheck, production build, release
worktree checks, and whitespace checks passed. Coverage includes configured and
default labels, safe text rendering, stable destinations/permissions, unchanged
callback values and query enablement, and no additional fetching. Actual Home and
AppShell components were checked with synthetic data at desktop and 390px mobile
widths in both views, including long titles and expanded controls; no horizontal
overflow was observed. Production settings and NXT records were not changed.
This is local verification; deployment remains a separate step.

## Deferred Family Import Navigation (September 19, 2026)

Family Import is omitted from the shared navigation list, so it no longer appears
on Home or in the main menu for any role. This is a conference-presentation
boundary, not a feature deletion or authorization change. The direct
`/family-import` route, its Home breadcrumb, existing permissions, API handlers,
stored runs, and data are unchanged. Bookmarks still work for authorized users.

Constituency Import remains in Start here. Import History remains under Imports;
the Home description points users to Start here for new constituency imports.
Its single remaining card fills the row instead of leaving unused grid columns.
No badges, loading behavior, background jobs, or NXT writes were added.

Verification: 3,110 tests in 267 files, typecheck, production build, release guard,
and whitespace checks passed. Regression tests cover all navigation roles, the
retained direct route/breadcrumb, ready import shortcuts, nonempty menu groups,
and source-page existence for every visible navigation destination. Synthetic
Home/menu checks covered desktop and 390px mobile layouts, accessible Import
History scrolling, and unchanged fundraiser primary paths without horizontal
overflow. This is an entry-path presentation check, not end-to-end live import,
report refresh, or NXT action acceptance. No production settings or records were
changed; deployment remains separate.

## Fundraiser Presentation Walkthrough (September 19, 2026)

Top Prospects filters now apply consistently to active and closed cards. Previously,
choosing a closed status filtered only the active list, while closed cards ignored
search and the other filters. The existing fiscal-year helper is reused: active
prospects use linked open opportunity years, and closed prospects use their saved
close year. Saved closed years are included in the options. Counts cover both
lists; filtered exports retain their existing active-only scope.

Filters have visible labels, touch-sized controls, and Clear filters / Show all
prospects recovery actions. Clearing filters removes only their URL parameters,
preserving workspace and other URL context. Empty workspaces are distinguished
from searches with no results, without inviting read-only users to edit. Closed
cards are keyboard-accessible. The My Prospects page header scrolls normally below
the desktop breakpoint rather than covering much of a mobile screen.

Follow-ups now uses Return to home and explains the difference between task
reminders and team talking points. Guidance distinguishes Mark complete from
opening the NXT action form; empty-state instructions respect edit permissions.
Shared report headings/navigation wrap long configured names and use 44px link
targets. The report-card grid can shrink below its previous 250px minimum.

No query keys, request policies, background schedules, permissions, NXT writes,
or export payload logic changed. Filtering and reset use already-loaded records.

Verification: 3,119 tests in 267 files, typecheck, production build, release guard,
and whitespace checks passed. Regression coverage includes closed status/search/
year filtering, export scope, keyboard opening, filter reset context, empty states,
and no extra requests. Actual components were checked with synthetic data at
1440px desktop and 390px mobile widths, including filter recovery, scrolling,
expanded saved gift/action/pledge details, follow-up guidance, and long report
navigation. No horizontal overflow was observed in those checks.

Production entry pages were inspected read-only while leaving the signed-in
Admin's Advancement Services setting unchanged. Fundraiser-specific responsive
checks used isolated sample data with network requests blocked. No live record
edits, imports, explicit NXT refreshes, or workspace changes were performed. This
is a focused presentation pass, not full end-to-end NXT acceptance. Deployment
remains a separate step.

## Advancement Services Presentation Walkthrough (September 19, 2026)

Pledge Payments and Top Prospect Exports now have a persistent Back to Home
link, including loading and error states. Both reuse the shell's configured
Advancement Services label without a separate settings request. The export
selector uses neutral workspace wording and the configured fundraising role;
export column keys, workbook headings, and payloads remain unchanged.

Export search now explains when selected workspaces are hidden but will still
be included. Clear search restores the roster without clearing selections.
An empty roster differs from a search with no matches, and selection controls
are touch-sized. Pledge search has its own no-match message and Clear search
control. Its result summary distinguishes the total matching rows from the
visible page range; totals still cover all matching saved rows, not just the
current page. Clearing search keeps the selected timing tab. Existing query
boundaries and incomplete-worklist warnings remain visible.

The import header identifies a saved run rather than declaring it ready for NXT
merely because it was saved. Guidance now covers explicit create controls as
well as send controls. Matching, duplicate checks, approvals, recovery, and NXT
write behavior are unchanged. Import History remains read-only and separate
from the Work Queue. Setup destinations and return paths were reviewed without
changing settings or permissions.

Verification: 3,125 tests in 267 files, typecheck, production build, release
guard, and whitespace checks passed. Regression tests cover hidden export
selections and unchanged export scope, empty rosters, search reset, saved pledge
pagination/totals, configured labels, Home links, retained incomplete warnings,
and import verification without resending. Search and selection tests assert
that no additional requests occur.

Actual components were checked with isolated sample data at 1440px desktop and
390px mobile widths, including export selection recovery, pledge pagination and
expanded schedules, import entry, Import History, and Setup. No page-level
horizontal overflow was observed; the detailed payment schedule retains its
own horizontal scroll area. Preview writes and external requests were blocked.

Production exports, saved pledge payments, history, and Setup were inspected
read-only. The live import entry showed a reviewer-access notice in the current
signed-in session; its complete reviewer flow was therefore checked only with
sample data and automated tests. That access discrepancy needs a separate
session/view investigation before conference rehearsal; no permission or view
changes were made to bypass it. No live imports, record edits, or explicit NXT
refreshes were performed. Deployment remains separate.

## Import Entry Access Recovery (September 19, 2026)

The import page now gates entry using the verified signed-in account returned by
the profile API, matching the import APIs' existing authorization boundary. An
Admin's MGO display preference or an Advancement Services account's additional
MGO role no longer incorrectly blocks entry. Acting-workspace roles and cached
authentication roles cannot grant import access. Inactive accounts and accounts
without Admin or Advancement Services permission remain blocked. No server-side
authorization policy changed.

Loading, sign-in required, insufficient permission, and an unavailable access
check are separate states. Profile reads bypass the browser cache, time out after
20 seconds, and can be explicitly retried. Incomplete or wrong-account responses
keep controls closed; late responses are ignored after timeout, account change,
or unmount. Saved-run and availability reads wait for verified access. Ordinary
renders and session object changes do not add profile reads. No background
polling or NXT calls were added to this check.

Regression coverage includes role combinations, display modes, acting-workspace
isolation, inactive and signed-out accounts, network and malformed-response
failures, timeouts, retries, account changes, and unchanged import completion
without resending. Existing duplicate protection, matching, creation, write,
verification, and recovery behavior remain unchanged.

Verification: 3,170 tests in 269 files, typecheck, production build, release
guard, and whitespace checks passed. Actual components were checked with
isolated sample data at 1440px desktop and 390px mobile widths. A simulated
failed access check recovered to the import form after Retry in both sizes;
the retry target is 44px tall, with no page-level horizontal overflow. Preview
writes and external requests were blocked.

The live import entry opened normally during the read-only investigation,
without changing the signed-in account or workspace view. The earlier live
incident was not reproduced, so its precise cause remains unconfirmed. The
fixed failure paths were reproduced in regression tests. No live imports,
permission changes, record edits, or explicit NXT refreshes were performed.
Deployment and a post-deployment signed-in recheck remain separate steps.
