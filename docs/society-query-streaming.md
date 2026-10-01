# Streaming Society Membership Queries

Implementation status: local candidate, not deployed or run against live NXT.

## Behavior

Society constituent queries consolidate by constituent System Record ID while
the CSV downloads. The importer no longer buffers the full file before removing
repeated rows. Existing spouse grouping and highest-society letter precedence
are unchanged. Singles remain eligible. Different email values and supported
organization contacts remain choices for recipient review; contacts never become
household members or appeal targets.

NXT suppresses identical query rows, not all rows sharing a constituent ID.
Multiple emails, contacts, codes, or other output values can therefore still
produce repeated constituent IDs. The app's saved deduplication summary records
raw rows, unique constituents, repeated rows, and `varyingOutputFields`.
The last field contains column names only, indicating values that varied within
at least one repeated constituent. It does not establish the original SQL join
cause or authorize removing those columns. Unused field values and diagnostic
fingerprints are not persisted. Multi-society source summaries carry the metrics
in the existing `sources[].deduplication` metadata; no routine UI warning is added.

## Bounds And Safety

- Society-only transfer limit: 64 MiB, replacing the prior 12 MiB buffered limit.
- Network chunks are handed to the decoder in slices no larger than 64 KiB.
- Existing caps remain: 100,000 raw rows, 1,000 unique constituents, 512 KiB of
  compacted output, and 20 email choices per constituent. Contact, field, and
  column bounds remain unchanged. Field diagnostics retain only bounded hashes
  per unique constituent/column, never the repeated raw table.
- The existing 15-second download timeout, HTTPS requirement, credential scoping,
  no-redirect policy, and HTTP/Retry-After error metadata are preserved.
- CSV MIME/charset validation happens before reading the body. Text decoding is
  fatal and incremental; split multibyte characters, quoted newlines, escaped
  quotes, and CRLF separators are handled across chunk boundaries.
- A completed NXT row count is required and must equal parsed raw rows at EOF.
  Missing/invalid counts, early EOF, invalid encoding, malformed CSV, limits, or
  conflicting spouse/name/address data fail the refresh. No partial table is
  attached to the query job or published as membership.
- All society sources must finish before the combined membership is replaced.
  A later-source failure leaves the last complete membership and letter history
  unchanged. No rows are arbitrarily selected to resolve conflicting identities.
- Buffered diagnostics, ordinary report size limits, query definitions, source
  mappings, recipient reviews, appeal writes, and delivery gates are unchanged.

## Verification And Live Acceptance

Local checks on October 1, 2026: 5,385 tests passed and 140 opt-in tests skipped;
typecheck, production build, release guard, and whitespace checks passed. The
unchanged list-report mixed-import build warning remains outside this change.

Tests exercise the real transport/decoder/parser with generated chunks totaling
more than 12 MiB: 41,273 rows reduce to 148 constituents, preserving two email
and contact options. Additional cases cover byte-by-byte UTF-8/UTF-16/Windows-1252,
EOF and row-count mismatches, malformed records, conflicts, stream cancellation,
timeouts, misleading Content-Length, HTTP failures, and existing report limits.

After an authorized JU-only deployment, verify the version and repeat the saved
membership refresh. Confirm both sources complete, inspect their compacted
counts and varying output column names, and verify a household and a single
recipient. An oversized or incomplete source must still not publish partial
membership. Refreshing membership does not send letters or assign appeals.
Do not change the saved NXT queries or mappings without reviewing the actual
returned fields. The exact current live file has not been validated by these
synthetic tests.
