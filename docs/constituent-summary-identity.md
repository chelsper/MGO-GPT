# Constituent summary identity

The constituent summary endpoint treats the selected NXT **system record ID**
as authoritative. A lookup ID, display name, or search result must never replace
that selection.

## Lookup and saved-data rules

- Require a positive integer system record ID before reading donor data.
- Make one direct constituent request. Do not search by name or lookup ID after
  a failed direct request, even if a search result would have an identical name.
- Require the returned constituent ID to match before contact data, giving,
  relationships, proposals, or summaries are returned or cached.
- Validate IDs in both keyed summary caches and portfolio summary snapshots.
  At least one explicit ID must be present and every present ID must match.
  Older snapshots with one matching ID remain usable.
- Ignore conflicting saved summaries without deleting them. A normal summary
  request may fetch verified live data; a saved-only request cannot call NXT.
- A failed refresh does not replace an existing summary or write to NXT.

Lookup/name hints remain in existing cache keys for compatibility, but do not
participate in identity resolution. The giving-only endpoint behavior is
unchanged: it uses the requested system ID without a constituent search.

## Failures and diagnostics

- Invalid system ID: HTTP 400.
- Direct response missing or conflicting identity: HTTP 409,
  `NXT_CONSTITUENT_IDENTITY_MISMATCH`, stage `constituent_identity`.
- Missing NXT record: HTTP 404, stage `constituent_retrieval`.
- Provider access denial: HTTP 403, with the original provider status retained.
- Other constituent retrieval failures: HTTP 502. OAuth failures retain the
  `blackbaud_auth` stage and retry metadata.
- Provider throttling and quota pauses retain their existing HTTP 429/503 and
  `Retry-After` behavior.

Direct lookup errors expose only safe messages and status/backoff metadata, not
private provider response bodies. Background portfolio refreshes retain the
identity/retrieval stage rather than reporting a generic processing failure.
Error responses are not cached.

## Related-person lookups and recovery

Family summaries use the same exact-system-ID lookup for linked spouses and
children. A relationship's `relation_id` identifies the related person;
`constituent_id` identifies the relationship owner and is never a fallback.
Unlinked relationship names can still appear without a related-person lookup.
Invalid or mismatched linked IDs produce an incomplete-family warning rather
than a substituted person. Related-record access errors remain sanitized, and
throttling pauses propagate to the worker.

If the relationships source or a linked-person lookup fails, the worker retains
the last good family details and narrative. It does not record an empty family
as a successful refresh.

On November 11, 2026, saved-only checks of five failed summaries across three
workspaces found the same family warning: `tryFetchConstituentById is not
defined`. The identity refactor had removed that helper while leaving family
call sites behind. The repair routes those calls through the verified loader;
regressions cover successful relatives, invalid/mismatched IDs, provider
failures, throttling, and preservation of saved family data.

After deploying the repair, retry only those failed items through the normal
rate-limited workflow and confirm their saved warnings clear. Do not delete
snapshots or rebuild every portfolio. An `optional_enrichment` failure may show
HTTP 200 and the last successful endpoint; inspect its saved section warnings
instead of treating that endpoint as the failed operation. Local passing tests
do not establish that the saved production failures have recovered.

## Verification and release

The required offline workflow gate includes the summary identity regressions,
existing summary modes, and background-refresh diagnostics. Tests use fictional
constituents and mocked database/provider responses; they do not modify live
records. Run `npm run build` from `apps/web` for the required workflow tests,
route generation, type checking, and production build. Deployment requires the
normal verified-candidate release process and separate authorization.

This change needs no schema migration, cache deletion, NXT write, or bulk
refresh. It prevents future substitution; it does not establish whether any
historical record was affected or repair historical data automatically.
