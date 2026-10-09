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

## Update Button Fix

The update button now rediscovers the current deployment on click, fetches the
pin-reset endpoint with the explicit header, requires a JSON receipt, and then
verifies ordinary credentialed version routing before navigating. It preserves
the current letter-history view and removes a stale `dpl` query parameter.

The endpoint still validates the expected deployment, rejects cross-site
triggers, restricts return destinations, and clears only version pins. JSON
requests avoid the fragile document redirect; the existing redirect response
remains for compatibility. Failures stay on the workspace with an explicit retry,
with bounded requests, no automatic retry loop, and cancellation on unmount.

The initial browser recovery did not require a deployment. The permanent button
fix was subsequently deployed with the user's explicit approval, as recorded
below. Older immutable clients can still need the verified header-based recovery
once before they receive this button fix. Do not retire old deployments or
disable skew protection globally without separate coordination.

Focused regression checks: 40 passed across release recovery, the notice, and the
reload endpoint. Evidence is in `/tmp/ju-letter-release-recovery-tests.log`.
The full suite passed 6,430 tests with 193 opt-in checks skipped, including 26
passing isolated PGlite letter database tests. Typecheck, build, release-worktree
checks, and `git diff --check` also passed. Full logs use the
`/tmp/ju-letter-release-recovery-` prefix. The initial browser recovery used the
already-deployed redirect endpoint; release verification also checked the new
JSON endpoint.

## Deployed And Verified

- Application commit: `03bb6c70353dd2dbe006a0ebb1e008b3e3f54add`.
- JU deployment: `dpl_4qpdAkg9NRGULz2LKJZrHMWZTocc`.
- Live site: https://www.jumgogpt.app.
- Candidate: https://mgo-n66t3a667-chelspers-projects.vercel.app.
- Previous deployment / rollback: `dpl_AtdZDUQXuVMccqBFU6mNyFVgsqoy`, application
  `8ca76693a06570e0b7d6a5ba50280c7bdcc4af55`.

All 1,230 tracked web files were compared with the tested checkout in an isolated
Git archive. No shared-branch push or unrelated dirty files were included. The
hosted build, candidate checks, and live checks passed. In addition to expected
release identity, main-page/assets, and access-control checks, both candidate and
live endpoints successfully handled an explicit-header JSON reset with a
synthetic previous-release cookie. Invalid and cross-site resets were rejected.

The user's Chrome letter-history tab was checked as idle before recovery. Its
existing old-version pin was reset using the new JSON endpoint, and an ordinary
credentialed `/api/version` request confirmed `03bb6c7` and the current deployment
before reloading. Authentication cookie values were unchanged across that reset
(values were never printed). The first browser-tool call timed out while waiting
for the operation; a read-only follow-up confirmed completion without repeating
the reset. The reopened workspace loaded `/assets/page-BsniWqS5.js`, showed no
update notice or release-change error, and retained its saved-history view.

The broad Vercel before/after check flagged a concurrent Shindig production
deployment. Comparison showed only JU and Shindig production identities differed;
this task issued deployment and promotion commands only for JU and did not push
Git. Sandbox `dpl_GeiPFGgbaBEYVvM2HW2GeD3TcK2t`, project settings, schedules, and PDF
settings were unchanged. Do not describe the broad all-project check as passing.

No letter batches resumed, appeals submitted, documents regenerated/downloaded,
emails sent, mailing statuses changed, or database migrations performed during
deployment verification. No global skew-protection setting was changed. Logs use
`/tmp/ju-letter-version-button-deploy-`. A temporary in-app browser probe was
closed without changing its cookies or records; the user's Chrome tab stays open.
