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
