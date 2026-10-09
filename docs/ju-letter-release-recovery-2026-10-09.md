# JU Letter Workspace Release Recovery

## Observed Failure

After the contact-code release, the user clicked **Load latest version** and
received "The release changed. Return to Society Letters and check for the latest
version." This was not user error and did not indicate a new deployment.

The browser had a host-only HttpOnly `__vdpl` cookie at `/` with deployment
`dpl_DJYvxvAvghicJAkAGc4vLSrebAPj`. The failed navigation correctly requested
`dpl_AtdZDUQXuVMccqBFU6mNyFVgsqoy` through both `dpl` and `expectedDeployment`.
Nevertheless, the older server handled the document navigation and rejected the
newer expected ID. Cookie-free smoke checks did not reproduce this condition.

In the actual browser, read-only `/api/version` requests established:

- Credential-free discovery returned the current `8ca7669` release.
- Normal credentialed routing returned the older `e29e65d` release.
- A credentialed fetch with `x-deployment-id` explicitly set to the current
  deployment returned `8ca7669`.

[Vercel's skew-protection documentation](https://vercel.com/docs/skew-protection)
describes the deployment header, cookie-based document pinning, and clearing the
pin. This incident specifically reproduced the cookie-versus-document-routing
problem in the user's browser; it must not be tested only with cookie-free HTTP.

## Browser Restored

The existing reload endpoint was fetched with the explicit deployment header and
normal same-origin credentials. Its redirect completed successfully and expired
only the framework version cookies. The workspace was then opened normally at
`/stewardship/society-letters?view=history&history=in_progress`.

An ordinary credentialed version request confirmed `8ca7669` / deployment
`dpl_AtdZDUQXuVMccqBFU6mNyFVgsqoy`; the update notice disappeared and the authenticated
workspace displayed all seven unfinished letters as selectable. Old saved
contact-code receipts remain until staff resume those letters. No batch was
resumed, appeal submitted, document regenerated, mail sent, or status changed.
Authentication cookies were not deleted or manually edited.

## Local Fix

The update button now rediscovers the current deployment on click, fetches the
pin-reset endpoint with the explicit header, requires a JSON receipt, and then
verifies ordinary credentialed version routing before navigating. It preserves
the current letter-history view and removes a stale `dpl` query parameter.

The endpoint still validates the expected deployment, rejects cross-site
triggers, restricts return destinations, and clears only version pins. JSON
requests avoid the fragile document redirect; the existing redirect response
remains for compatibility. Failures stay on the workspace with an explicit retry,
with bounded requests, no automatic retry loop, and cancellation on unmount.

This code fix is not yet deployed. This user's browser recovery did not require
a deployment. Older immutable clients can still need the verified header-based
recovery once before they receive this button fix. Do not retire old deployments
or disable skew protection globally without separate coordination.

Focused regression checks: 40 passed across release recovery, the notice, and the
reload endpoint. Evidence is in `/tmp/ju-letter-release-recovery-tests.log`.
The full suite passed 6,430 tests with 193 opt-in checks skipped, including 26
passing isolated PGlite letter database tests. Typecheck, build, release-worktree
checks, and `git diff --check` also passed. Full logs use the
`/tmp/ju-letter-release-recovery-` prefix. The new JSON response and button still
require candidate/live verification when this local fix is deployed; the current
browser was recovered using the already-deployed redirect endpoint.
