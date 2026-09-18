# Workflow Navigation

## Primary Destinations

- Configuration editors return to Setup Hub. Home remains available in the app breadcrumb.
- Individual reports show a visible Back to reports link. The Reports landing page returns Home.
- Prospect detail dialogs name the originating list: Top Prospects or My Portfolio. Returning closes the dialog in place, retaining the mounted list and workspace. The existing next-step draft warning still applies, including on the labeled return button. Loading and error states also provide a return control.
- Action/opportunity entry names its validated return destination, including My Portfolio, Reports, or Follow-ups & Discussion. Explicit return query strings and anchors are retained. Same-origin referrers remain a fallback; unknown, API, auth and external paths fall back Home. Navigation does not change fundraiser attribution or submit the form.
- Constituency Import returns to Import History, or to the originating batch when opened from a comparison. Import results can return to the saved batch and row from which they were opened. Opening the saved batch still requires an explicit click.

## Import Safety

Comparison links open a separate tab, leaving the original draft intact. They carry only saved run and row IDs as return context. Nested return parameters are removed to avoid comparison chains. The saved-run handoff forwards both the requested row and `preload: false`; loading the saved batch does not implicitly run live detail checks, create a record or apply staged changes. Existing unsaved-import and busy-operation guards are unchanged.

Import History remains read-only with no approval, retry or apply actions. Legacy `queueRun` / `queueRow` URLs continue to work, but no longer claim to originate in Work Queue. Family Import is intentionally outside this pass.

## Verification

Tests cover visible report return labels, safe URL validation, Admin-on-behalf workspace labels, closing a filtered prospect list in place, cancelled dismissal of a dirty next-step draft, import batch/row round trips, no automatic batch loading, and no NXT writes on return-link rendering or saved-row navigation. This pass does not add storage of donor search text or change portfolio loading/refresh policies.
