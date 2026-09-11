import { describe, expect, it } from 'vitest';
import { IMPORT_RESULT_COPY, importHistoryQuery, parseImportHistoryFilters, serializeImportHistory } from './importHistory';

describe('read-only import history', () => {
  it('defaults to successes and bounds pagination and filters', () => {
    expect(parseImportHistoryFilters('https://example.org')).toEqual({ outcome: 'successful', type: 'all', search: '', page: 1 });
    expect(parseImportHistoryFilters('https://example.org?outcome=failed&type=family&page=3&q=Smith')).toEqual({ outcome: 'failed', type: 'family', search: 'Smith', page: 3 });
  });
  it.each(['outcome=all', 'type=unknown', 'page=0', 'page=-1', 'page=1.5', 'page=1e3', 'page=100001', `q=${'a'.repeat(161)}`])('rejects invalid filters: %s', (query) => {
    expect(() => parseImportHistoryFilters(`https://example.org?${query}`)).toThrow('Invalid');
  });
  it('uses one parameterized read with stable ordering and no raw provider payloads', () => {
    expect(importHistoryQuery).toContain('LIMIT $4 OFFSET $5');
    expect(importHistoryQuery).toContain('updated_at DESC, source, id::bigint DESC');
    expect(importHistoryQuery).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(importHistoryQuery).not.toContain('raw_row');
    expect(importHistoryQuery).not.toContain('requested_writes');
  });
  it('returns bounded records and only approved display fields', () => {
    const result = serializeImportHistory({ successful: '51', failed: '3', records: [{
      id: '5', source: 'constituency', run_id: '4', row_number: 3, name: 'Example Person',
      lookup_id: '123', result_code: 'created', raw_row: { secret: 'hidden' }, blackbaud_error: 'sensitive error',
    }] }, { outcome: 'successful', page: 1 });
    expect(result).toMatchObject({ counts: { successful: 51, failed: 3 }, hasMore: true, pageSize: 50 });
    expect(result.records[0]).toMatchObject({ key: 'constituency-5', label: 'Record created', name: 'Example Person' });
    expect(result.records[0].note).toContain('additional staged changes');
    expect(JSON.stringify(result)).not.toMatch(/sensitive|hidden|raw_row|blackbaud_error/);
    expect(serializeImportHistory({ successful: 51, failed: 3, records: [] }, { outcome: 'successful', page: 2 }).hasMore).toBe(false);
  });
  it('does not claim partial or unconfirmed imports succeeded', () => {
    expect(IMPORT_RESULT_COPY.partial.note).toContain('did not fully complete');
    expect(IMPORT_RESULT_COPY.unconfirmed.note).toContain('may already be saved');
    expect(importHistoryQuery).toContain("IN ('unconfirmed', 'started')");
    expect(importHistoryQuery).toContain("'manual_required', 'blocked'");
  });
  it.each([{}, { successful: null, failed: 0, records: [] }, { successful: '', failed: 0, records: [] }, { successful: 'invalid', failed: 0, records: [] }, { successful: 0, failed: -1, records: [] }])('rejects malformed database results instead of showing zero', (result) => {
    expect(() => serializeImportHistory(result, { outcome: 'successful', page: 1 })).toThrow();
  });
});
