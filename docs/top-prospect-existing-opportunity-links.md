# Link Existing NXT Opportunities

Implemented November 9, 2026. Prepared for the user-authorized JU release;
deployment requires the protected GitHub gate and verified Vercel promotion.

## User Workflow

Open an active Top Prospect and choose **Link existing NXT opportunity** in
Active Opportunities. Select the existing open opportunity, then choose
**Link selected opportunity**. Cancel stays in the same prospect without saving.

The picker includes older and undated opportunities for that exact constituent
assigned to the workspace's MGO. It does not change the bulk import's existing
creation-date, campaign-purpose, stage, or expected-date rules. It does not create
or update anything in NXT, including fundraiser assignments, dates, or amounts.

An undated opportunity remains visible with **Expected date needed**. It counts
in the saved open pipeline, but not in a particular fiscal-year total. The
existing Opportunity Pipeline report keeps it in **Needs FY / review**. Users
can set an expected date later through the existing opportunity editor.

## Safeguards

- MGO-own-workspace or Admin-delegated edit permission, exact constituent IDs,
  and the workspace's NXT fundraiser ID are required. Names never link records.
- The picker loads on demand only, with one constituent-scoped GET, a 100-row
  cap, no inline provider retries, and the existing shared Blackbaud cooldown.
  Incomplete, duplicate, or malformed responses fail rather than appear complete.
- Saving re-reads the exact selected NXT ID and rechecks constituent, assignment,
  and open status. Only provider-derived fields are stored, not browser amounts.
- Both GET and POST bind the viewer/workspace scope. A workspace switch requires
  reopening the picker. Read-only viewers do not receive a linking control.
- A local PostgreSQL transaction checks identity again, refuses conflicting or
  pending links, inserts the local mirror, updates derived ask totals, clears
  saved summary caches, and marks portfolio summary data stale atomically.
- A shared advisory transaction lock serializes NXT-ID insertion with manual
  linking, the existing importer, and the existing create-and-save path. Retry
  reuses a saved link instead of inserting another opportunity. Archived links
  are retained and are never silently moved or reactivated by this feature.
- No database migration is required. Ranking, local notes, follow-ups, saved
  portfolio assignments, and donor-activity timestamps remain intact.

## Verification

Required offline workflow tests cover eligibility exceptions, IDs, assignment,
roles, stale workspace scope, incomplete results, idempotent responses, and UI
selection, cancel, errors, and saved-data cache invalidation.

`existingOpportunityLink.integration.test.js` executes real transactions against
a disposable PostgreSQL socket matching `/private/tmp/opportunity-link-pg.*`,
port 55449, using `OPPORTUNITY_LINK_TEST_PG_SOCKET`. It never reads DATABASE_URL.
It covers concurrent links/imports/creates, rollback, undated fiscal-year
exclusion, identity changes, pending links, and preservation of existing data.

Juli Duvall's live opportunity was inspected read-only in the preceding
investigation. This implementation does not itself link or change her record;
deployment and the explicit selection remain separate steps.
