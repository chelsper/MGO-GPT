# App release cleanup - November 3, 2026

Status: implemented and locally verified; not deployed.

## User experience

Authenticated workspaces can show a compact "Load latest version" notice when
public production metadata differs from the JavaScript build currently open.
Checks run on mount and window focus, with a one-minute throttle and a ten-second
timeout. There is no automatic reload, continuous polling, or NXT request.
Society Letters retains its existing specialized notice and batch-busy guard,
without a second banner.

The user must confirm that unsaved edits are saved and running batches are paused.
The update returns to the same allowed app path, filters, and anchor. An explicit
`dpl` URL parameter is removed. In-flight same-origin API mutations disable the
button; another check immediately before cookie reset and navigation catches
concurrent saves. This does not detect unsaved form edits, work in other tabs, or
background server jobs; the confirmation remains important.

Failures stay in the current workspace with an explicit retry. Recovery has a
15-second timeout, rejects repeat clicks, and aborts when leaving the view. No
saved request, approval, letter, mailing status, stock balance, or NXT record is
modified by this feature.

## Release boundary

Vercel's installed React Router adapter writes a host-only `__vdpl` pin without
an explicit Path, so old sessions can be pinned independently at page-parent
paths. This is version-skew protection, not an authentication cookie. Protection
remains enabled. See [Vercel Skew Protection](https://vercel.com/docs/skew-protection).

Recovery first discovers the current production deployment without credentials.
It sends a same-origin POST to `/api/app-release/reload`, forcing that request to
the discovered deployment with `x-deployment-id`. The route requires the explicit
`x-ju-release-reset: 1` header, JSON, an allowed internal return path, matching
deployment ID, and same-origin browser context. Input is bounded to 8 KiB. It
expires only host-only `__vdpl` cookies at known framework scopes and current
page ancestors. Login/session cookies and data are untouched. GET cannot reset.

Before navigation, recovery verifies BOTH an unforced credentialed `/api/version`
request and the actual document path. The latter uses `x-ju-release-check: 1` to
receive public version metadata, avoiding a private document render. API/auth
routes cannot use this document probe. Responses are non-cacheable. A current
API response alone is insufficient proof that a nested page is unpinned.

Code predating this notice cannot display it retroactively. On the first release,
already-pinned users may need one supervised load of the current deployment after
saving their work. Do not clear all cookies or disable deployment protection.

## Rendering investigation

The in-app inspection browser inserted
`div#codex-browser-sidebar-comments-root` as a direct child of `html`, after `body`.
It was absent from the server response. React reported an unexpected `div` in
`html`, then fell back to client rendering. An isolated full-document test
hydrates the clean tree without replacement; adding the observed outside-body
overlay reproduces the warning. This supports an inspection-browser cause for
the warning observed here, not a claim that every possible rendering warning is
resolved. [React's hydration guidance](https://react.dev/errors/418) identifies
pre-hydration browser modifications as a possible cause.

No production DOM-removal workaround, warning suppression, or SSR disablement
was added. A normal signed-in browser smoke check remains part of deployment
acceptance. The local dev preview can lose injected dev styles during the
overlay-induced document replacement; it is not evidence of a production CSS
regression.

## Verification

- Required offline gate: 2,066 tests across 109 files, none skipped. This includes
  60 new release-recovery assertions and the existing Society Letters workflows.
- Route generation and TypeScript passed.
- Production build passed with its source fingerprint unchanged during checks.
- Release worktree check and whitespace check passed.
- The actual notice component with the built stylesheet was inspected at desktop
  and 390-pixel mobile widths in a fictional-data preview: no horizontal overflow,
  readable wrapped text, and a 44-pixel button. The full local workspace also
  retained its request list after a deliberately unavailable reset endpoint.
- No database migration or provider credentials are needed for this change.
- Hosted edge-cookie behavior is not verified by unit tests and must be checked
  after deployment. Existing strict stale-session diagnostics remain unchanged;
  an old pin still serving old code must not be reported as an automatically
  updated session merely because a cookie-free request succeeds.

For hosted acceptance, use an isolated synthetic cookie jar or disposable browser
session, not a user's unsaved workspace: reproduce a prior version pin, perform
the explicit current-version recovery, verify unforced API and document-path
metadata, and confirm the filtered view is preserved. Confirm only version cookies
were expired and that no business-data endpoints were called. Retain a normal
signed-in workflow smoke check separately; this metadata-only test does not prove
authentication or business workflow behavior.
