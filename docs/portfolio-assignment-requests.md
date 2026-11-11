# Portfolio assignment requests

## User workflow

In **Find a constituent**, an active MGO, Executive, or Admin can choose
**Request portfolio assignment**, optionally enter a reason, and send the
request to Advancement Services. The requester is always the signed-in user,
even when an Admin is viewing another MGO's workspace.

The confirmation explicitly says this is a request, not an assignment. It does
not write NXT, create a prospect, or add a constituent to a portfolio. Cancel
closes the form in place. Requesters can track the saved request in Data Requests.

## Advancement Services workflow

Requests appear in the existing Advancement Services **Data Updates** queue as
**Portfolio assignment request**. The detail includes the requested fundraiser,
constituent's NXT system ID, optional reason, and a link to the NXT profile.
Existing AS/Admin review permissions apply; MGOs cannot complete their request.

Reviewers check existing solicitor assignments and make any approved assignment
in NXT, then mark the request Completed. Decline it with reviewer notes when not
approved. Changing the queue status does not itself update NXT. The approved NXT
assignment reaches the app through the existing portfolio sync process.

## Implementation and safeguards

- POST `/api/portfolio-assignment-requests` accepts `submit` or read-only `verify`.
- Requests use `data_change_requests`; no schema migration is required.
- `source_context` is `constituent_lookup_assignment`.
- An advisory transaction lock and separate Read Committed statements prevent
  concurrent submissions for the same requester and NXT ID from creating multiple
  open requests. Retries preserve the existing request and reviewer notes.
- Only newly saved requests trigger the existing AS notification helper. Failed
  notifications leave the queue item intact and show a warning to the requester.
- A browser timeout offers a status check, not an automatic replay. The request
  helper covers both response headers and body with a deadline.
- Generic data requests cannot submit this request type or overwrite these rows.
- No NXT-writing helper or portfolio writer is imported by the request service.
- Other pre-existing assignment workflows are not changed by this feature.

## Verification

The required workflow manifest includes the service, route, component, and lookup
page tests. Existing queue and data-request tests cover the reviewer handoff and
guard against generic request overwrites.

`apps/web/scripts/check-portfolio-assignment-requests-postgres.mjs` additionally
tests concurrent submissions against the real request table definition in an
isolated temporary schema. It requires an explicitly disposable PostgreSQL
instance, with a Unix socket named `/private/tmp/portfolio-request-pg.<suffix>`
on port 55443; set `PORTFOLIO_REQUEST_TEST_PGHOST` to that directory and put `psql`
on PATH. It never loads application/provider credentials. Do not point it at
production or another developer's database.
