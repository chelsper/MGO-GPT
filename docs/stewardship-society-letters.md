# Stewardship: Society Letter Creation

Initial implementation, September 22, 2026. Production release requested by the
owner after verification. Deployment does not configure a JU membership query
or enable society-letter email delivery. No production schema, NXT constituent,
or donor email was changed during implementation; the additive stewardship
tables initialize on the first authorized workspace read after deployment.

## Workflow

Advancement Services and Admin users open **Stewardship > Society Letter
Creation**. Access uses the signed-in user's real role, not an impersonated MGO.

1. Configure a saved NXT query of qualified households and map its output fields.
2. Choose current calendar year, current fiscal year, or explicit period dates.
3. Select the annual society hierarchy from Organization Settings. Its display
   order is highest first. Include only tiers where a higher letter should replace
   every lower letter, not unrelated recognition programs.
4. Upload a Word `.docx` template for each society, including embedded letterhead.
5. Explicitly refresh membership, select up to 50 households, and download/review
   personalized previews before reserving a batch.
6. For postal mail, download Word letters, print/mail them, then mark the batch
   mailed. Preparing/downloading never marks a letter sent.
7. For email, explicitly confirm sending the queued batch. The client advances
   three recipients per request. Leaving the page stops further requests; already
   submitted messages are never automatically repeated.

The first version intentionally uses reviewed batches of 50 rather than an
unbounded send-all action. Email attachments are personalized DOCX files, not
PDFs. A full batch downloads as ZIP; archives exceeding 3.5 MB must be downloaded
one letter at a time. Lifetime societies and letters sent outside this application
are not imported automatically.

## Household Query Contract

### Multiple Annual Society Queries (September 24)

In **Source & period**, choose **Separate query for each society (preview only)**.
Select the annual letter hierarchy, then configure a distinct saved query ID,
actual qualification dates, and constituent/spouse column mappings for each
selected society. Each query may use different output column names. Switching
from a single constituent query retains that society's existing configuration
in the editor. Unconfigured sources require their own dates; no query dates are
invented. Lifetime societies and inactive definitions are excluded.

**Letter templates** now accepts a separate versioned template for every active
annual society before membership queries are configured. This does not enroll
that society in the hierarchy or enable any delivery. Existing prepared letters
retain their frozen versions. The prepared CY2026 OOD template is an organization
asset, not embedded in the application code or automatically copied to sandbox.

Refresh explicitly processes one source at a time, with its own metadata checks
before execution and before accepting output. Each request advances at most one
source; opening or filtering the page performs no NXT work. Resume retains the
current NXT query job and completed cohorts. An uncertain job creation requires
an explicitly confirmed restart. A refresh is bound to the initiating account,
source settings, definition signature and period. New periods require renewed
confirmation of every query's qualification dates.

The combined preview is replaced only after all queries finish successfully,
including queries returning zero rows. Failures retain the previous snapshot
and letter history. The oldest source verification time is used for combined
freshness. Limits remain 1,000 output rows and 512 KB per query, with at most
5,000 households and 4 MB of accumulated cohorts across the selected sources.
Oversized results are rejected, not truncated.

Opposite spouses returned in different society queries form one household only
when both ID groups agree. Conflicting spouse links, group membership, or recipient
data for the same constituent reject the refresh. No names, addresses or gift
totals are used to infer household qualification. The highest matching society
in the configured hierarchy becomes the proposed letter; the other matches and
their source query IDs are retained. This is not proof that an excluded higher
society member has never received a letter: sent-appeal exclusions still require
independent appeal/history checks before delivery.

All multi-query output remains **preview only**, enforced by the API as well as
the UI. It cannot generate/reserve letters, send email, or assign appeals.
Approved joint recipients, communication restrictions and per-member NXT appeal
verification/write recovery are still required before activating this source.
Existing already-grouped sources and their frozen delivery history are unchanged.

### Constituent/Spouse Preview Adapter (September 24)

The Source & period screen also accepts **Constituents with spouse IDs (preview
only)**. This supports an ordinary saved constituent query without asking NXT to
produce pre-grouped household rows. The existing already-grouped workflow is
unchanged.

The adapter verifies the selected ID columns against saved-query field metadata
before execution and again before accepting results. Both must be **System
Record ID** fields from Constituent Information and Spouse, respectively. A
numeric-looking lookup ID, or a lookup column renamed "System Record ID", is not
accepted. Relevant query-definition changes during execution retain prior
results and require a new refresh. Execution statistics do not invalidate results.

The administrator specifies the query's society and exact qualification dates.
Those dates must match the letter period; the adapter does not modify NXT dates
or silently reuse a fixed-year query in a later year. This is a single-society
cohort preview, not verification of every household's highest annual society.

One-to-many constituency rows collapse when identity and recipient values agree.
Reciprocal spouse rows produce one group. A spouse system ID remains in that
group even when the spouse is absent from the returned cohort. Conflicting links,
overlapping pairs, malformed rows, self-links, or conflicting recipient values
reject the refresh. Names, email addresses, and postal addresses never establish
household membership. Individual giving totals are never summed.

The stable grouping key is the lower system ID, not an inferred NXT head of
household. All member IDs and returned recipient candidates are visible for
review. No recipient, joint addressee, or communication permission is selected
automatically. Members outside the query are explicitly identified as requiring
verification, including whether they are constituents eligible for appeal writes.

**Server-side preview-only boundary:** this source cannot generate, reserve, or
send letters, or assign NXT appeals. Query refresh is explicit and adds two
metadata reads, not a profile read for every member. No production source
configuration is selected automatically. Before enabling this source for delivery:

1. Verify household membership and communication restrictions, including spouses
   outside the query; choose an approved joint recipient/address/salutation.
2. Check all configured higher society cohorts and existing assigned appeals.
   A single OOD query cannot rule out a President's Society spouse.
3. Freeze the exact society/period appeal in the prepared letter and persist
   separate per-member assignment status before each external write. Verify
   uncertain writes by readback; never blindly repeat them or recreate a letter
   because one spouse's assignment failed.
4. Resolve the owner's desired appeal trigger (finished-letter creation versus
   accepted email/confirmed postal mailing). Previews must never set a sent appeal.

Read-only definition checks of JU query **31043 (MGOGPT - OOD)** confirmed on
September 24: the CY2026 dates are inside gift summary 71937; constituent system
ID is field 349 and spouse system ID is field 89939. Output also includes lookup
IDs, primary addressee/salutation, preferred address components, and preferred
email. The existing exclusion references appeal system ID 770, description
`CY2026 OOD Letter Sent via JUMGOGPT`. That one-to-many exclusion alone is not an
app-side proof that every household member lacks the appeal. No live query
execution, donor send, production source change, or constituent write was part
of the adapter's implementation.

### Already-Grouped Sources

The query is the authority for giving qualification, household membership, and
communication eligibility. This workflow does not sum individual gift totals,
infer households from addresses, or treat portfolio caches as a complete source.
Qualification must be verified against the society's giving rules and credit
treatment before enabling delivery. No query is selected automatically.

Map these distinct output columns (names are configurable):

| Field | Required meaning |
| --- | --- |
| Household ID | Stable household/head constituent **system record ID**, not lookup ID |
| Member IDs | All household member system IDs including the head, separated by `|`, `;`, or `,` |
| Household Name | Human-readable household name |
| Society | Exact configured annual society name or key |
| Addressee | Approved household mailing addressee |
| Salutation | Approved household salutation |
| Mailing Address | Complete printable address; required for postal delivery |
| Email | One approved household email; required for email delivery |
| Email Allowed | `Yes`, `True`, or `1` only after email restrictions are checked |
| Mail Allowed | `Yes`, `True`, or `1` only after postal restrictions are checked |
| Period Start | Qualification period start, `YYYY-MM-DD` or `M/D/YYYY` |
| Period End | Qualification period end, same accepted formats |

Restrictions must include applicable deceased/inactive, solicitation, opt-out,
and invalid-contact rules. Empty permission values are not permission to send.
Identity conflicts, ambiguous columns, conflicting household recipient values,
or members belonging to multiple households fail the whole refresh. Last valid
results and acknowledgment history remain intact. No partial result is sent.

The existing query transport limits output to 1,000 rows, 25 columns, and 512 KB.
Oversized results are rejected rather than silently truncated. Several rows may
describe different society qualifications for the same household; they collapse
to one highest-tier letter. The query must provide the complete member list and
consistent recipient information on each row.

Membership must be refreshed within 24 hours before preparing letters. Queued
email recipients older than 24 hours must be cancelled, refreshed, and reviewed
again. Changing a query/mapping invalidates the old snapshot for new batches.
Calendar/fiscal windows roll forward automatically, but a fresh query is still
required. A custom period must be explicitly advanced. Overlapping period or
hierarchy changes after reserving letters require a reviewed migration.

## Templates And Delivery History

Templates accept `.docx` up to 1 MB. Supported merge fields:

```text
{addressee} {salutation} {address} {household_name} {society_name}
{period_start} {period_end} {letter_date}
```

Word formatting and embedded images are retained. Macros, external relationships
(including externally linked images/hyperlinks), embedded objects, unrecognized
merge expressions, and excessive ZIP expansion are rejected. Template versions
are retained, and prepared batches freeze their template and recipient values.
Updating a template does not change previously prepared letters. At 100 retained
versions, reviewed archiving is required; versions used in history must not be
removed casually.

One shared database ledger covers both delivery methods. Same-period history
matches by household ID or overlapping member IDs, protecting against a changed
household head. A higher-tier acknowledgment covers all lower tiers without
claiming those lower letters were sent. For example, President's Society covers
Order of the Dolphin; a prior Dolphin letter still permits a later President's
upgrade. A new period permits a new acknowledgment after refreshed qualification.

This is **letter acknowledgment coverage**, not an NXT society-membership write.
Existing membership codes and constituents are never modified by this feature.

States:

- `prepared`: reserved postal letter, not mailed.
- `pending_email`: reviewed email reservation, not submitted.
- `sending`: submission durably recorded before contacting the email provider.
- `emailed`: provider accepted the message, not proof of inbox delivery.
- `delivered`: matching provider receipt confirms delivery.
- `mailed`: staff explicitly confirmed postal dispatch.
- `needs_review`: uncertain/failed email; held against repeat sending.
- `cancelled`: unsent reservation released, history retained.

Prepared, sending, queued, and uncertain letters block another letter for that
household/period. Cancellation affects only prepared or queued letters, never
already submitted/uncertain messages. Staff must not cancel letters that were
actually mailed. Unknown email outcomes require checking Resend; verification
matches the provider ID, recipient, and saved letter tag. It never resends.
Unresolved provider failures remain held; there is no force-resend bypass.

## Database And Concurrency

After authenticated reviewer access, `ensureSocietyLetterSchema` creates:

- `stewardship_letters`: single-organization settings, versioned templates,
  saved eligibility snapshot, query job, revision, and mutation lease.
- `stewardship_letter_deliveries`: immutable prepared payloads plus delivery
  status, provider ID, actor IDs, and timestamps.

Every mutation requires the loaded revision and an exclusive 120-second lease.
Batch reservation is a single PostgreSQL statement, protected by a partial
unique index on household/period/society excluding cancelled reservations.
Expired leases cannot mutate state. A durable `sending` transition precedes each
external email call, with a stable per-letter idempotency key. A lost response or
final database-write failure leaves a hold, never an automatic retry.

The current ledger and templates are read as a bounded initial feature, not a
large-scale mailing platform. History pagination, archival, background bulk-send
jobs, and a reviewed resolution path for definitive provider failures are future
extensions. Keep JU and sandbox databases and provider credentials isolated.

## Activation Checklist

Email is off unless `STEWARDSHIP_EMAIL_ENABLED=true`. Leave it off in JU until:

1. The actual household query and returned field meanings are reviewed. The
   required grouped household output may need a query/adapter developed for JU.
2. Society order, giving rules, period boundaries, and communication permissions
   are confirmed against known household examples.
3. Every template is uploaded and visually checked in Word, including long
   names, addresses, embedded letterhead, and page breaks.
4. Prior letters already sent this period are imported through a reviewed ledger
   migration, or an explicitly approved new unsent cohort is used. Otherwise the
   app cannot know about acknowledgments sent outside it.
5. A non-donor fixture is used to test postal preparation and one email end to end
   in the isolated sandbox with a verified sender and `RESEND_API_KEY`.
6. Replay, two-reviewer conflicts, provider uncertainty, new periods, and tier
   upgrades are checked before a controlled production pilot.

Email cover text and attachments use the existing verified organization sender.
The Resend key must permit receipt reads as well as sends to use verification.
See [Resend email retrieval](https://resend.com/docs/api-reference/emails/retrieve-email)
for provider receipt fields. No automatic NXT refresh occurs merely by opening
the page; source refresh is explicit, resumable while open, and can be explicitly
restarted without deleting letter history.

## Verification

Focused tests cover household eligibility, period boundaries, tier upgrades,
template validation and rendering, API roles, preview confirmation, UI behavior,
provider uncertainty, and replay protection. `societyLetterStore.integration.test.js`
is opt-in against a disposable local PostgreSQL cluster; it never uses
`DATABASE_URL`. Start that cluster with a Unix socket under
`/tmp/stewardship-pg.<suffix>`, port 55439, database `stewardship_test`, and set
`STEWARDSHIP_TEST_PG_SOCKET` to its private socket directory to run it.

Verification on September 22: the full suite passed 3,703 tests across 316 files.
The five opt-in PostgreSQL tests passed separately against the disposable local
PostgreSQL 18 cluster, which was then stopped. The normal suite skips that file
without its explicit local socket environment variable. `git diff --check` and
the production build both pass. Live membership, production database behavior,
and rendered letter layout with JU's actual templates remain to be validated.

No live donor send, production migration, or NXT write is part of these tests.
npm audit reports 35 existing dependency findings;
none names the added document-template packages or their new dependencies.
This is not a claim that the application's full dependency graph is clean.
