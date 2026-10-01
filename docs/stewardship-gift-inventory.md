# Stewardship Gift Inventory

## First Release

Admin and Advancement Services can open Stewardship > Gift Inventory to maintain
the app's gift catalog. Active and Archived views support local search and
availability filtering. Items have a name, optional description and storage
location, and staff-maintained availability: Not checked, Available, Unavailable.
These are item types, not stock quantities. No quantity is inferred.

The optional **Review starter items** flow contains 26 gift-specific names from
JU's user-supplied NXT action custom-field screenshot. Staff select items and
explicitly add them; opening the page never seeds the database or calls NXT.
Event, workflow, and generic Other Gift fields were excluded. The names are not
verified live NXT mappings. They contain no NXT system IDs or accepted values.
New installations remain empty unless an authorized user chooses to import.

Archive accepts an optional reason. Restore keeps the same item ID and resets
availability to Not checked. Original source names, prior metadata, archive
reasons, actors, and timestamps remain in audit history. Re-imports skip both
existing and archived items, even if an imported item's display name changed.
Case and whitespace-normalized names are unique across both views.

## Catalog Release Boundaries

- No NXT API reads or writes, donor updates, deliveries, emails, or stock movements.
- Existing stewardship requests and their shared work queue remain unchanged.
- Item selection on requests is the next increment described below. Quantities,
  reservations, and fulfillment are not implied by marking an item Available.
- Each deployment uses its own database. The schema contains no automatic JU seed.
- Only the actual signed-in Admin or Advancement Services actor can read/write;
  viewing another workspace does not confer its permissions.

## Persistence and Recovery

`stewardship_gift_items` holds current metadata. `stewardship_gift_item_events`
stores an immutable snapshot per item version. Runtime schema setup is additive
and advisory-lock protected. Writes serialize catalog changes and lock the actor
row, rechecking active status and role in SQL. Version checks reject stale edits;
unique names and source keys prevent duplicate creates/imports. Audits and item
changes commit in the same transaction. No delete API is provided.

The UI binds responses to the auth viewer, disables repeat submissions, and keeps
a draft after failures. After an uncertain save or conflict, close and reload to
check actual saved state before editing again. Retried creates cannot duplicate
their request ID; retried archives/restores fail the old version check. History
is loaded on demand (latest 50 changes); catalog reads do not poll NXT.

## Verification

Unit/UI tests cover validation, starter selection, archive/restore, conflict
recovery, account changes, permissions, CSRF checks, history, and navigation.
The opt-in PostgreSQL fixture tests real transactions, simultaneous imports,
competing edits, normalized duplicates, permission changes, and audit rollback.
It accepts only a disposable local `/tmp/ju-maintenance-pg-*` socket on port 55443,
uses its own `stewardship_inventory_fixture` schema, and never reads DATABASE_URL.

Local validation on October 1, 2026: 5,250 regular tests passed (115 opt-in tests
skipped); all 11 inventory PostgreSQL tests passed in a separate fixture run.
Type-check and production build passed. A synthetic, offline browser preview
verified add/edit/archive/restore and the 390px mobile layout without horizontal
overflow. These tests performed no live database or NXT writes. The catalog was
then deployed to JU on October 1, 2026; see
[the release note](ju-gift-inventory-release-2026-10-01.md). Its 26 starter names
were explicitly added through the production UI, all with Not checked availability.

## Request Connection

Release status for the request connection and received items is tracked in
[the combined stewardship release note](ju-stewardship-combined-release-2026-10-01.md).

Personal gift assistance requests now support an optional gift preference. Only
active items marked Available are offered for new selections. A fundraiser can
still ask for help without choosing an item. Staff can choose, replace, or clear
the preference while the request is open or in progress. Completed or declined
requests must be reopened before changing their choice.

This extends the existing request, not a second inbox. Its saved gift preference
appears in Stewardship Assistance Requests, the original fundraiser follow-up,
and the fundraiser's submission tracker. Names and descriptions are shared with
fundraisers; storage location and catalog audit details remain staff-only.

The additive schema stores the catalog ID and an immutable name/description/version
snapshot on the request and its audit events. Renaming or archiving an item does
not rewrite prior request history. Archived or unavailable selections may remain
on existing requests but cannot be newly selected. Inventory writes and request
selections share a transaction advisory lock so an archive cannot race a new
selection. Request version checks protect competing staff updates. Retries return
the original request rather than creating another one or changing its selection.

Choice lists load on demand from the app database, without NXT calls or polling.
The staff endpoint checks the actual signed-in reviewer and viewer binding; the
fundraiser endpoint uses the existing editable-workspace/task authorization.
Gift selection never reserves stock, marks delivery, completes a follow-up, or
creates an NXT action. Receipt is now recorded separately as described below.

Validation: 5,262 regular tests passed (123 opt-in tests skipped), plus all 25
stewardship assistance PostgreSQL tests in an isolated local fixture. Type-check,
production build, and whitespace checks passed. A synthetic browser workflow
confirmed a fundraiser selection, staff replacement, and the same saved request
and progress note in both views. The 390px layout had no horizontal overflow.
No production requests or NXT records were changed for these tests.

Before offering choices, staff should review catalog availability; the imported
starter names intentionally remain Not checked until that review. A later release
can add separately audited quantities and reservations, followed by an explicitly
configured and verified NXT action/custom-field write contract.

## Received Items

Stewardship > Gift Inventory > Received Items is a searchable ledger of confirmed
receipts recorded in the app. Each catalog item also has a **Who received this?**
link that filters the ledger to its stable item ID, including archived items.
Search accepts recipient name, constituent system ID, item name at receipt, or
fundraiser name. Results are paginated in groups of 50, newest recorded first;
each row shows the actual received date separately. Recipient and item shortcuts
make it easy to move between a person's history and everyone who received an item.
Search is submitted explicitly, not on each keystroke, and never calls NXT.

Admin and Advancement Services can use **Record received item** on an existing
Personal gift assistance request after saving its gift preference. The date
defaults to today (Eastern), can be changed to a past date, and cannot be future.
An optional note and explicit confirmation record actual receipt, not a requested
gift or a shipment still in transit. The original request and fundraiser follow-up
remain at their current status; no stock is deducted and no NXT action is created.
The saved receipt appears on the same request in the staff queue, fundraiser
follow-up, and submission tracker. The follow-up also links to receipt history
before a new request is submitted.

The ledger requires the original constituent system ID and saved item ID; names,
ownership, and item snapshots come from the server, not browser-supplied donor
data. `stewardship_gift_receipts` stores the recipient, item snapshot, received
date, fundraiser snapshot, recording staff member, and timestamp. One active
receipt is allowed per request. Idempotency tokens, request version checks, a
partial unique index, and the catalog/request advisory lock protect duplicate or
competing writes. Receipt changes and request audit/version updates are atomic.
Recording receipt does not require an item to remain available: a previously
selected item may have since been archived or run out of stock.

Once a receipt exists, the selected gift cannot be changed underneath it. Staff
can use **Correct this entry**, supply a reason, and void the receipt without
deleting it. The row is omitted by default but remains visible under **Include
corrections**. The request can then be reopened if needed and a corrected receipt
recorded. Replaying an old create token never resurrects a voided receipt.

Only the actual signed-in Admin/Advancement Services actor can record or correct
receipts. MGOs have read-only access to ledger entries owned by their own workspace;
viewing another workspace cannot lend its permissions. Staff can view all entries.
Responses are viewer-bound and no-store, and reads recheck active status and role.
Return links from a request or follow-up preserve that source context.

This is not a complete history of stewardship gifts in NXT. Earlier NXT action
custom fields have not been imported, nor are requests/completed tasks inferred
to be deliveries. Empty states explicitly avoid claiming the donor never received
anything. Historical NXT ingestion needs a separate reviewed mapping and source-ID
deduplication step; do not infer receipt from catalog field names alone.

Validation on October 1, 2026: 5,299 regular tests passed (140 opt-in skipped),
and all 42 assistance/receipt PostgreSQL tests passed separately in the disposable
local fixture. Type-check and production build passed. Browser checks used only
synthetic data and confirmed recording, the linked fundraiser receipt display,
history, correction preservation, and a 390px layout without horizontal overflow.
Production, sandbox, NXT, and donor records were not changed for this increment.

## Next Inventory Phases

Status reviewed October 1, 2026: the catalog, optional request choice, and
app-recorded recipient history are live. Adding, editing, archiving, and restoring
item types is supported. Numeric stock and item pictures are not implemented.

1. Import existing NXT action custom-field history read-only. Review the mapping
   from each attribute to a catalog item and what its value means before treating
   it as receipt. Keep stable source action/attribute IDs, deduplicate repeat
   imports, label imported history separately, and preserve corrections. Do not
   infer receipt from an attribute category alone or deduct current stock for
   historical gifts.
2. Add audited stock quantities. Staff establish an opening count; replenishment,
   fulfillment, returns, and count corrections create explicit stock movements.
   Unknown quantity must remain distinct from zero. Retries must not deduct twice,
   concurrent updates must not oversell, and corrections retain their history.
   If reservations are added, display on-hand, reserved, and available separately.
3. Extend the existing Add/Edit item form with an optional picture and accessible
   description. Validate file type and size, use instance-isolated storage, and
   allow replacement without rewriting receipt or stock history. Archived items
   remain discoverable in past recipient history.

These are proposed increments, not capabilities of the current release.

### JU History Source Readiness

The selected JU source is query **31053**, **Stewardship Action Query - JUMGOGPT**,
replacing proposed constituent query 31052. Read-only inspection on October 1,
2026 confirmed an Action query and 834 returned rows before its latest output
changes. Release and live import results are recorded in the history release note.

Present output includes Action System Record ID, Action Custom Field Import ID,
Action Custom Field Category, Action Custom Field Date, Name, and Fundraiser
Name. The user added Action Completed, Action Completed On, Constituent Import
ID, and Constituent Integration ID. The Action query field picker does not expose
Constituent System Record ID. Leave that mapping blank: the importer reads each
selected completed action and uses its authoritative constituent_id. It never
substitutes lookup/import/integration IDs. Action Date Added is not a receipt date.
Use a reviewed custom-field receipt date or actual completed date.

The query also returns non-gift categories. Map only actual stewardship gift
categories to inventory items; do not treat every returned action as a receipt.
Category presence may be used only with explicit staff verification that it
means an item was actually received. Query configuration belongs to this JU
instance, not hard-coded defaults shared with the sandbox.

### Historical Import Workflow

Staff can open Received Items > Import NXT gift history. Loading a query only
reads NXT; mappings and previews are saved in the app. Match returned columns,
map gift categories to catalog items (including archived items), and explicitly
confirm that completed actions and the selected field rules mean actual receipt.
An exact-name matching shortcut leaves all unknown categories excluded.

Recipient verification reads at most 25 selected actions per step with a bounded
time budget, then saves progress. It pauses for Blackbaud rate limits. No polling
or import runs merely from opening the page. The final preview separates new,
already imported, corrected, possible app matches, and conflicting records.
Only an explicit Import command writes the app ledger. NXT and stock never change.

Duplicate protection uses Action System Record ID plus Action Custom Field
Import ID, not donor name or constituent ID alone. Corrections preserve that key
so a repeat query cannot resurrect a voided receipt. Possible app-recorded matches
with the same item, recipient, and date are skipped for review. Invalid IDs/dates
or conflicting source identities fail closed. Blank/future dates are not guessed.

The import is bound to its initiating staff account and NXT connection. It has
version/lease guards, active-role checks inside database writes, and atomic
receipt/audit updates. Query jobs expire after 30 minutes and loaded previews
after 24 hours. Limits are 10,000 raw rows, 2,000 distinct receipts, 4 MiB streamed
input, and 2 MiB retained row JSON. No partial query results are published.
Imported rows are staff-only until fundraiser ownership is verifiable; names
alone never grant MGO access. Use one NXT database per application instance.
