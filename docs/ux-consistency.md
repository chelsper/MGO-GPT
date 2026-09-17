# Workflow UX Consistency

Roadmap step 4, September 17, 2026. Implemented locally after Integration Health
deployment `d9532d4fd94568c3777f1e666445037f0f2b9c49`; this pass is not yet deployed.
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
native dialog. No live import or NXT mutation was made. Signed-in production
acceptance of these changes remains a separate post-deployment step.

See [workflow acceptance](mgo-workflow-readiness.md) for the broader release checks.
