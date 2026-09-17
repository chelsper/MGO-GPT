# Admin Integration Health

Added September 17, 2026, after the application baseline in
[Developer Handoff](../DEVELOPER_HANDOFF.md). This feature is prepared locally;
deployment and production acceptance are separate steps.

## Entry And Access

`/integration-health` appears under **Admin & Workspace** in the Admin menu and
Advancement Services home. Admins can also reach the menu link while using MGO
view. Advancement Services alone does not grant access.

`GET /api/admin/integration-health` verifies the authenticated email against the
current database account and requires an active Admin role. An acting cookie,
query parameter, or session role claim cannot widen access. Responses, including
errors, are private/no-store. The page does not retain results in browser storage,
poll automatically, or add Work Queue/notification badges.

## Read-Only Boundary

The health endpoint reads saved database evidence only. It does not call NXT,
refresh OAuth tokens, initialize schema/users, claim leases, enqueue work, change
workspace selection, or mutate receipts. Reload saved status repeats that same
read. Navigation to an original workflow is separate from choosing an operation
there. No reconnect, repair, force-resend, or approve endpoint is added.

The scheduled-account resolver is reused because it only reads account metadata.
Connection DTOs expose token-presence booleans indirectly as status guidance,
timestamps, and staff names, never token values or scopes. The page explicitly
does not certify live authorization, cron execution, or end-to-end health.

## Sections

| Section | Saved evidence / interpretation |
| --- | --- |
| Blackbaud cooldown | Subscription circuit-breaker deadline. No saved pause does not prove live API availability; individual jobs can also pause |
| Connections | Active saved connections plus the viewer; current scheduled-account selection. Expired renewable access tokens are not presented as broken connections |
| Portfolio maintenance | Active MGO saved assignments, summary/giving freshness and failures, and latest job progress. Constituents no longer assigned are excluded; summary and giving backlogs overlap |
| Last gift/action enrichment | Existing opt-in configuration and current-origin assigned records only; checks never verified, currently due, classified failures, and worker daily budget. Missing queue rows count as never checked |
| NXT action verification | Reminder-linked receipts in review/processing only, with owner and reminder ID. No donor name, action notes, request payload, raw provider message, or constituent ID is returned |

Portfolio jobs unchanged for 15 minutes are described as needing a progress check,
not definitively failed. Activity eligibility/lease timestamps are not promises of
execution time. Worker call reservations are not the remaining subscription quota.
Last-successful timestamps describe the most recent individual check, not a claim
that the whole portfolio has refreshed.

The list does not combine historical import results into an approval queue.
Pledges, import outcomes, and legacy submission exceptions retain their original
pages. This first health page is not a comprehensive monitor of every NXT write,
email, report, or external service.

## Failure And Recovery UX

- One section failing to read produces an explicit unavailable/unknown state while
  other sections remain usable. Failure is never rendered as an empty healthy list.
- A page read failure clears the old privileged response. A subsequent 401/403
  cannot leave previously loaded operational details visible after reload.
- A stalled browser read times out after 20 seconds and offers manual retry;
  unmount aborts the request. There is no automatic retry loop.
- Connections are reauthorized by their owner only when necessary. Throttling is
  a wait condition, not a reason to reconnect every MGO.
- Reminder links retain the existing ownership checks. The Admin must select the
  named owner's workspace; a URL does not switch it or borrow permissions.
- A saved action ID can be checked through the existing read-only verification
  flow. Missing IDs or interrupted processing require investigation, never a
  duplicate create or receipt deletion. Inactive-owner receipts remain visible
  for investigation but do not offer an editing shortcut.

## Performance And Limits

Reads use aggregate SQL and narrow metadata projections, not per-constituent API
calls. Connections, active MGO workspaces, and pending receipts each display up to
100 records with explicit total/truncation notices. Connections/workspaces are
alphabetical; verification receipts are oldest first. There is no pagination in
this initial bounded view. No database schema changes are needed.

The activity scope remains the existing allowlist/canonical origin and is disabled
in previews. Older portfolio/job tables are workspace-scoped, not origin-scoped;
the page does not invent stronger isolation than those stores provide. Separate
development/production databases remain required.

## Verification

Automated coverage checks actual-account authorization (including combined roles,
inactive users, and ignored acting IDs), no-store responses, sanitized failures,
read-only queries, DTO redaction, cooldown/token interpretation, origin/pilot scope,
partial failures, explicit reload, revoked access, timeout/unmount, and navigation.

On September 17, 2026: 2,648 tests in 235 files passed, along with typecheck, build,
and release guard. The new SQL was also executed in read-only transactions against
a disposable local PostgreSQL instance with synthetic records: assignment
deduplication, removed/inactive/origin isolation, missing snapshots, daily reset,
renewable connection status, and receipt filtering passed. The actual page was
also rendered with synthetic responses and the built stylesheet at desktop and
390px mobile widths, with no horizontal overflow or browser errors. No production
DB or NXT writes were used. Production access/appearance acceptance remains for
release.
