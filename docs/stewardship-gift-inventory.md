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

## Boundaries

- No NXT API reads or writes, donor updates, deliveries, emails, or stock movements.
- Existing stewardship requests and their shared work queue remain unchanged.
- Item selection on requests, quantities, reservations, and fulfillment are future
  increments, not implied by marking an item Available.
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
overflow. No live database or NXT writes were performed. Deployment is pending.

Next: link catalog item IDs to the existing Personal gift assistance requests,
with archived items excluded from new choices but retained on historical requests.
Then add separately audited stock counts, reservations, and fulfillment, followed
by an explicitly configured and verified NXT action/custom-field write contract.
