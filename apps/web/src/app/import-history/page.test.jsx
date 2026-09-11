import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportHistoryPage from './page';

const record = { key: 'constituency-1', source: 'constituency', name: 'Example Person', label: 'Imported', note: 'The saved import completed successfully.', filename: 'sample.csv', runId: '12', rowNumber: 3, lookupId: '456', updatedAt: '2026-09-10T14:00:00Z' };
const payload = (overrides = {}) => ({ counts: { successful: 51, failed: 2 }, records: [record], page: 1, pageSize: 50, hasMore: true, ...overrides });
const response = (body, ok = true) => ({ ok, json: async () => body });
beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => response(payload()))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const ready = () => waitFor(() => expect(screen.getByRole('button', { name: 'Refresh history' })).toBeEnabled());

describe('Import History', () => {
  it('shows successes with no approval, retry, or write controls', async () => {
    render(<ImportHistoryPage />);
    await ready();
    expect(screen.getByText('Example Person')).toBeInTheDocument();
    expect(screen.getByText('Read-only history. Nothing to approve.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Successfully Imported Records 51' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Run #12 / Row 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve|retry|resolve|confirm|send|complete/i })).not.toBeInTheDocument();
    expect(fetch.mock.calls.every(([url, options]) => url.startsWith('/api/import-history?') && !options.method)).toBe(true);
  });
  it('switches to failures with honest partial and unconfirmed results', async () => {
    render(<ImportHistoryPage />);
    await ready();
    fetch.mockResolvedValue(response(payload({ records: [{ ...record, label: 'Partially imported', note: 'Some changes were saved, but this import did not complete.' }] })));
    fireEvent.click(screen.getByRole('button', { name: 'Failed Imports 2' }));
    await ready();
    expect(screen.getByText('Partially imported')).toBeInTheDocument();
    expect(fetch.mock.lastCall[0]).toContain('outcome=failed');
    expect(screen.getByText(/These are results, not approval requests/)).toBeInTheDocument();
  });
  it('paginates and resets to page one when searching or filtering type', async () => {
    render(<ImportHistoryPage />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await ready();
    expect(fetch.mock.lastCall[0]).toContain('page=2');
    fireEvent.change(screen.getByRole('combobox', { name: 'Import type' }), { target: { value: 'family' } });
    await ready();
    expect(fetch.mock.lastCall[0]).toContain('type=family');
    expect(fetch.mock.lastCall[0]).toContain('page=1');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: "O'Brien" } });
    fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
    await ready();
    expect(new URL(fetch.mock.lastCall[0], 'https://example.org').searchParams.get('q')).toBe("O'Brien");
    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));
    await ready();
    expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
  });
  it('shows loading and error states rather than false zero counts', async () => {
    fetch.mockResolvedValue(response({ error: 'Only Advancement Services users can view import history.' }, false));
    render(<ImportHistoryPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading saved results');
    await screen.findByRole('alert');
    expect(screen.queryByText(/No successful imports/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Successfully Imported Records ...' })).toBeInTheDocument();
  });
  it('does not overwrite a new view with an old response', async () => {
    let finishOld;
    fetch.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    render(<ImportHistoryPage />);
    fetch.mockResolvedValue(response(payload({ records: [{ ...record, name: 'Failed Person', label: 'Import failed' }] })));
    fireEvent.click(screen.getByRole('button', { name: 'Failed Imports ...' }));
    await screen.findByText('Failed Person');
    finishOld(response(payload()));
    await waitFor(() => expect(screen.queryByText('Example Person')).not.toBeInTheDocument());
    expect(screen.getByText('Failed Person')).toBeInTheDocument();
  });
});
