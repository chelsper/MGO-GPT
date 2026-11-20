# Advancement Services Pledge Payments

Entry points: Advancement Services home and navigation, under **Reports & Exports > Pledge Payments** (`/pledge-payments`). Opening the home page does not fetch pledge data or start a refresh.
Only active admin and Advancement Services users (including the legacy reviewer
role) may read or refresh `/api/pledge-payments`. Authorization uses the actual
session user, not an acting MGO. Cache and refresh leases are scoped to that user
and app origin; one user's NXT connection is not used to populate another's cache.

## Prospect indicators

Top Prospects' View Prospect detail and My Portfolio's expanded/Detailed cards
show **Active pledge** when the constituent has a verified unpaid pledge in the
saved report. Compact card headers stay unchanged. The indicator shows a pledge
count, verification date, and summarized **Total pledged**, **Balance due**, and
**Next payment due**. **Overdue amount** appears only for a positive overdue
balance. Amounts are USD and sum the included active pledge gifts once each;
total pledged is not lifetime giving, and balance is not inferred from payments.
Missing amounts or unsafe sums show unavailable, never zero or a partial total.
The next payment is the earliest unpaid installment due **today or later** across
those pledges; if all outstanding installments are in the past, it says "No
upcoming payment." Overdue is the remaining balance of unpaid installments
strictly **before Eastern today**, excluding due-today and settled installments.
These dates are recalculated from saved schedules on the existing app read; the
as-of date is shown separately from the report's verification date.
Retained failed/pending records are labeled as older report data. With multiple
pledges, the date is the oldest included verification, not a newer date that
would imply every pledge was just checked.

`GET /api/prospect-pledge-status` is a narrow shared pledge summary projection for
active workspace users. It selects the most recently started query-12033 job
owned by an active admin/Advancement Services user on the same app origin.
It never unions older reports from other users. Discovery must be complete;
only that manifest's last-good unpaid records can contribute. Settled pledges,
absent manifest IDs and unverified new rows do not contribute. A pledge appearing
in both report tabs counts once. Query boundaries stay unchanged.

The server intersects those results with the authenticated selected workspace's
saved NXT portfolio and local Top Prospects constituent **system IDs**. Caller-
provided constituent/workspace IDs cannot widen access. Existing authorized
Admin/Executive delegated read access is preserved. This deliberately shares
only pledge presence and the above summary figures for assigned prospects; raw
schedules, payment details, and other donors are not returned. The full report endpoint stays
reviewer-only and no other user's connection or raw cache is returned.

The page makes one independent cached app read per viewer/workspace, not one
NXT call per person. Card expansion, filtering, grouping and sorting make no
pledge requests. Loading or failure does not block the existing page, create
new refresh jobs, or write to NXT. No indicator means only that no positive
saved-report signal is available; it must never be labeled "no active pledge."
All notices explicitly identify saved query data rather than a live NXT check.

## Worklist definitions

- Standard NXT `Pledge` gifts returned by saved Gift query **12033**, "all pledges
  unpaid"; not recurring gifts or matching pledges. Its existing amount, date,
  status, and missed-payment criteria are intentional and remain unchanged.
  This is a query-scoped worklist, not a claim to include every unpaid pledge.
- One row per pledge, not per donor. Multiple pledges remain separate.
- Past Due includes outstanding installments with due dates **through today**.
  The overdue count is strictly before today; currently due includes today.
  The date shown is the oldest unpaid installment; the amount is all unpaid
  installment balances due through today.
- Upcoming includes outstanding installments strictly after today, sorted by
  earliest due date. Amount due is the sum of remaining installments on that
  next date, not the pledge's full future balance.
- A pledge can appear in both tabs. Do not add the tabs' pledged totals together.
- Dates use Eastern today and NXT calendar dates without shifting midnight UTC
  back to the previous day. Date classification is recalculated from cached
  schedules when the page loads, without an NXT request.
- Total pledged and balance come from the pledge gift. Paid to date is the sum
  of verified applied payment amounts whose gift dates are through today.
  It is **not** pledge amount minus balance: that would count write-offs as paid.
- Remaining installment balance, not original scheduled amount, determines dues.
  Settled (paid or written off) installments have no amount due.
- Unknown payment types, missing amounts, malformed dates, duplicate application
  keys, or inconsistent pledge/installment balances require review. No guessing,
  default-zero financial values, or partial replacement of last-good data.
- Amounts display as USD, following this organization's existing report currency.

## Refresh and safety

GET only reads local cache. Load/Refresh starts a persistent job. Discovery uses
separate checkpointed stages: validate Gift query metadata, submit one asynchronous
CSV execution, poll that job, then download its `sas_uri` and verify the manifest.
There is no all-pledges listing or fallback on a query error. Following requests perform at most six
individual retrieval/normalization steps, sequentially, with a 45-second soft
budget. Even individual payment-gift reads are checkpointed. The existing central
SKY transport handles bounded retries and subscription quota cooldowns.

Only `QRECID` selects gift system IDs. Do not substitute Gift ID (lookup ID),
Constituent ID, integration IDs, or installment IDs. Query row count must equal
the parsed CSV row count before deduplicating repeated installment rows by gift.
The September 10, 2026 diagnostic returned 394 CSV rows and 69 distinct `QRECID`
values; three sampled IDs were confirmed by Gift Get as positive-balance pledges.
The actual result MIME was `text/csv; charset=windows-1252`.

CSV downloads are bounded at 10 MB, 50,000 rows, and 64 columns. Bad encoding,
HTML/JSON/XLSX, missing IDs, ambiguous headers, malformed rows, and count mismatches
pause discovery without replacing the previous cache. SAS URLs and raw CSV are
never persisted. Only the existing SKY API host, single-account Azure Blob
hosts, and the verified Blackbaud result host `nsa-pusa01.app.blackbaud.net` are
accepted. The latter was confirmed from the authenticated job response for
query 12033 on September 10, 2026. Signed-file downloads do not receive the
Blackbaud bearer token or subscription key. Nonstandard ports, URL credentials,
fragments, lookalike domains, and redirects are rejected in this workflow.

The initial production job paused at `query_download` with
`invalid_query_result_url`: the original allowlist omitted Blackbaud's own
signed-file host, despite successful query execution. This was not a Gift API
permission failure. After the host correction, **Resume** checks the same saved
query job, obtains a fresh signed URL, and validates its manifest without
resubmitting the query. Paused discovery is labeled by stage, not `0 / 0 pledges`.

Query polls are spaced three seconds apart and stop for manual Resume after 30
pending responses. Resume polls the same query job. Submission has no automatic
POST retries: an uncertain outcome is held for explicit cancel/restart rather
than quietly executing another job. Throttling preserves stage and Retry-After.
Each selected gift is still verified as a Pledge; if it was settled after query
execution its cached row is cleared without fetching the rest of its schedule.

Each pledge retains its last-good normalized snapshot alongside a staging draft.
Successful pledges publish incrementally. Failed new pledges are excluded and
listed in review issues; failed previously loaded pledges retain visibly stale
values. During discovery prior rows remain visible; after the full manifest is
discovered, rows absent from that manifest no longer appear. Incomplete worklists
are always labeled as such. No report snapshots or production count logic change.

The browser continues batches only after an explicit Load/Refresh/Resume action.
Closing or pausing the page preserves progress. Resume does not rerun verified
items. Retry failed pledges restarts only failed pledges from fresh gift data.
Cancel preserves cache; a later explicit Refresh creates a new manifest.
There is **no new scheduled/nightly workload** in this feature.

Existing jobs from the old all-pledges source cannot resume or retry. They display
an explicit **Use query 12033** action, which starts query discovery under the same
cache scope. Old values are marked stale and retained until the new manifest is
verified; they are not presented as a complete query-scoped worklist. New query
jobs retain normal resume, cancellation, and failed-only retry behavior.

Single-writer database leases and checkpoint conditions prevent concurrent tabs
from overwriting each other's progress. Interrupted leases expire after three
minutes. No tokens, bank/payment-method data, raw donor payloads, or raw upstream
error bodies are persisted in diagnostics. The only Blackbaud POST executes the
saved query; all constituent/gift retrievals are GET-only. No NXT definitions or
donor records are changed.

## Pledge Reminder CSV

Admins and Advancement Services can use **Create pledge reminders** after a query-12033 refresh finishes (including completed-with-errors jobs). The current tab and search define the proposed worklist. Select up to 200 eligible pledges across the full filtered result, not just the displayed page. Each pledge remains a separate reminder even if the same donor has several pledges. CSV export remains available alongside the individual PDF/email handoff.

Choose the letter date and explicitly prepare the selection. Preparation makes one bounded, non-retried constituent GET per pledge through the signed-in reviewer's own NXT connection, sequentially; it does not rerun the query or update gifts. The UI can pause after the current read and continue remaining items without replacing already prepared drafts. A failed read stops the loop, preserving finished drafts in the current page.

Amounts come from the current verified saved pledge worklist, not a fresh balance check. Past Due uses unpaid installment balances through Eastern today; Upcoming uses balances on the next unpaid installment date only, excluding arrears. Paid to date uses verified payment applications rather than amount minus balance. The letter date changes only the displayed letter date, not financial classification. Saved verification timestamps and the amounts-as-of date remain visible and are included in the CSV. Refresh the worklist before preparing reminders when payments may have changed.

Staff can edit the suggested addressee and separate address lines, city, state and ZIP locally. Extra street lines are preserved in Address_Line_2. Missing/current-address issues require correction or exclusion; Do not mail, deceased/inactive, mismatched-identity and international addresses are held rather than silently included. This first template is US-address-only. Organization names are suggested as the addressee; staff can add the intended contact/attention line. No household merging or guessed spouse/foundation attribution occurs.

After one explicit review confirmation, download only ready selected reminders; held rows are counted visibly and remain available for correction. A server-side cached-state check revalidates reviewer access, user/origin scope, job, selected IDs, verification timestamps, timing view and Eastern day immediately before download, with no NXT calls. Changed/stale data blocks export without deleting drafts. The CSV preserves leading ZIP zeroes as text, quotes multiline values, neutralizes spreadsheet formulas and maps these exact template fields: `Addressee`, `Address_Line_1`, `Address_Line_2`, `City`, `State`, `Zip`, `Fund`, `Pledge_Amount`, `Amount_Paid_to_Date`, `Installment_Amount`. Additional audit columns include `Letter_Date`, `Due_Date`, pledge/constituent IDs, balance and check dates. Word should merge `Letter_Date` instead of retaining a typed date.

Drafts are page-local, not a persisted mailing history. Leaving before downloading prompts a warning; closing asks before discarding unexported prepared drafts. Export never sends email, applies an appeal, marks mailed, adjusts balances, or creates NXT records. Review merged Word letters and the template's current payment instructions before dispatch. The supplied template and its banking information are not bundled into public application assets or committed to the repository.

## Individual PDF and Outlook Handoff

After preparing recipient details, expand **Prepare a PDF and Outlook email** and select one ready pledge. Confirm the recipient and saved amounts, then choose **Prepare PDF & email**. The server validates the saved worklist before and after generation and reads the constituent again through the reviewer's own NXT connection. Client-supplied amounts or email addresses are never used.

The PDF uses the supplied letter's appreciation wording, a single-spaced address, pledge reference, fund, financial statement and JU online-giving link. Per staff approval, bank and stock-transfer instructions remain in the existing Word template, not application code. PDFs are generated privately in memory using the existing pdf-lib dependency; no converter, storage, migration or new environment settings are required. Unsupported characters or oversized content fail safely with a CSV/Word alternative.

Download the PDF first, then open Outlook on the web or the default email app. The recipient is the verified primary NXT email; missing, inactive, restricted, mismatched or unconfirmed email status blocks email links without blocking an otherwise valid postal PDF. Staff may edit the plain-text subject/message. Attach the PDF manually, verify the sending account and recipient, and send in Outlook. Opening a compose link does not attach a file, connect a mailbox, prove sending, or create an NXT action. Reopening may create a second draft. Copy-email-text is available as a fallback.

Prepared files are page-local. Changed reminder details invalidate them, and the handoff expires after 15 minutes. Previously downloaded files and Outlook messages cannot be updated automatically. Saved pledge amounts are validated, not refreshed from NXT; refresh the pledge worklist first if payments have changed. The UI says **Prepared, not sent**. Preparation never creates an NXT action.

## Staff-confirmed Sending and NXT Actions

This follow-on feature is separate from the PDF/Outlook release deployed November 20, 2026. It requires the additive `pledge_reminder_snapshots` and `pledge_reminder_logs` tables. No new mailbox connection or environment setting is needed.

Preparing a PDF with a valid primary email saves a private, owner-scoped reminder snapshot in the app: recipient, verified email, pledge/reference IDs, fund, financial amounts, check timestamp, letter/due dates and filename. Full postal addresses, PDF bytes and edited email bodies are not retained. If snapshot persistence fails, PDF and compose functionality remain available with an explicit logging-unavailable notice. Existing CSV export is unchanged.

After actually sending in Outlook, expand **Record reminder sent in NXT**, choose the actual sending date and confirm that the matching PDF was attached. This explicit operation creates one completed **Email / Stewardship** action through the signed-in Admin or Advancement Services user's own NXT connection. It records staff-confirmed sending, not app-verified delivery. It does not send mail, change balances, add appeals or change MGO assignments. The historical reminder's saved financial amounts remain unchanged if payments arrive later.

**Saved pledge reminders and NXT logging** shows the latest 50 prepared email reminders for the signed-in account. Loading saved details does not call NXT. Downloading a PDF, opening Outlook or preparing a reminder never records sending. Older snapshots remain stored but are not currently paginated in this first history view.

A durable database claim is saved before creating the action. Duplicate protection spans staff accounts for the same reminder event and the same pledge/actual sending date. Any unresolved action for that pledge blocks new submissions, even if someone edits the date or regenerates the PDF. A genuinely later reminder is allowed after the earlier result is verified. Each write has retries disabled; a lost response is held for investigation, not resubmitted.

If the outcome is uncertain, use **Reload saved status**, then **Verify existing NXT action only**. This reads the checkpointed NXT action ID (or the existing action ID staff supplies after checking NXT) and requires an exact match to the saved reminder, recipient, dates and completed Email/Stewardship fields. It never creates or edits an action. Missing/mismatched actions stay held for staff investigation; no automated release or resend is offered. Only the original recording staff account can recover its pending action here. Another account sees the hold without the original account's action ID.

Local database verification: `PLEDGE_REMINDER_TEST_PGHOST=/private/tmp/pledge-reminder-pg.<suffix> node scripts/check-pledge-reminder-logs-postgres.mjs` against a disposable PostgreSQL server listening only on that socket, port 55441. This tests the actual additive schema/store with simultaneous starts and cross-staff claims. It must not use a production database. Live Outlook delivery and live NXT action acceptance require a separate authorized pilot; automated tests use fictional records only.

Future automatic attachment/mailbox integration is documented in [Pledge reminder Outlook readiness](pledge-reminder-outlook-readiness.md); it is not required for this simple handoff.

## API references and deployment validation

- [Gift list and Gift Get](https://developer.sky.blackbaud.com/api#api=58bdd5edd7dcde06046081d6&operation=GetGift)
- [Gift V2 installments](https://developer.sky.blackbaud.com/api#api=gft-gifts&operation=GetInstallments)
- [Gift V2 pledge payment applications](https://developer.sky.blackbaud.com/api#api=gft-gifts&operation=GetPledgePayments)

The Gift V2 endpoints are public preview. Verify live endpoint permissions with
an Advancement Services connection after deployment. A forbidden endpoint or
unsupported response must remain a visible review issue, never a zero balance.
For first acceptance, compare an unpaid pledge, a partial payment, a write-off,
and a pledge with multiple payments to the same NXT records before relying on
the worklist for outreach. Loading the worklist and preparing/exporting reminders send no mail or NXT writes. Only the explicit staff-confirmed action operation described above writes to NXT.
