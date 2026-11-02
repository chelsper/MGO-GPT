# Portfolio Stewardship Panel

## User Workflow

Open My Portfolio, then a donor's More actions > Stewardship. The side panel is
available in compact, focus, and detailed views without expanding the donor card.
Closing it preserves the worklist's filters, view, pagination, and position.

- Open and recent requests: existing assistance requests owned by the selected
  MGO, with status, preferred item, and needed-by date. Opening a request uses
  its existing source follow-up, not a second queue.
- Recorded gifts received: the latest five non-voided receipt records visible
  to the signed-in account, including imported NXT history when permitted.
  Missing received dates stay explicitly unknown. The full received-item history
  is linked with the constituent ID preselected.
- Next stewardship touches: open stewardship next steps and saved gift follow-ups
  for the selected MGO and exact constituent. Matching names never establish identity.
- Request assistance: available on eligible saved gift follow-ups. Existing
  requests open for review instead of presenting a second submission form.
- Log stewardship action: reuses the existing action side panel, starting with
  interaction type Stewardship. Saving is an explicit NXT action; opening or
  canceling the form is not. Cancel and the post-save return lead back to Stewardship.

## Scope and Safety

`GET /api/portfolio-stewardship` authorizes the real session, editable workspace,
requested viewer/workspace IDs, and the donor's saved portfolio assignment before
reading data. Executive read-only workspaces do not expose the action menu.

The endpoint reads saved database records only. It does not fetch NXT, change
inventory, complete requests, apply appeals, or send anything. It is lazy-loaded
on opening, uses no-store responses, cancels reads on close, and treats failures
as unavailable data rather than empty history. Changing workspace closes the panel.

Receipt permissions are unchanged: MGOs see their owned receipts; reviewers can
see all authorized receipts for that donor. Imported receipts without an MGO owner
are therefore not automatically exposed to MGOs. The panel labels this limitation;
an empty list does not mean the donor has never received an item.

Requests and follow-ups are bounded to 10 entries each with truncation notices.
Requests prioritize open/in-progress items, then recent completed/declined items.
Follow-ups prioritize earliest due date. Receipt records are ordered by recording
ID, not an inferred delivery date. Completed assistance requests do not prove delivery.

This is not a comprehensive NXT action timeline. Proactive assistance requests
without a saved gift follow-up, broader imported-history access, and a consolidated
action timeline remain separate future work. No schema migration or new write
endpoint is required for this panel.

## Verification

- `npm run test:workflows` includes panel navigation, permission boundaries,
  selected-workspace isolation, cancellation, response mismatch, failure/retry,
  existing request reuse, and the original action writer.
- `npm run build` runs the mandatory workflow, route/type, and production-build gates.
- `STEWARDSHIP_TEST_PGHOST=/private/tmp/portfolio-stewardship-pg.<suffix> node scripts/check-portfolio-stewardship-postgres.mjs`
  executes the actual queries against fictional PostgreSQL fixtures. It rejects
  non-test hosts, creates a temporary schema, and removes that schema afterward.
  It tests exact IDs, conflicting links, owner isolation, receipt permissions,
  voided receipts, missing dates, and list bounds. Default local socket port: 55443.
