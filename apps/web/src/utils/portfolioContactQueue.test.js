import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPortfolioContactQueue } from "./portfolioContactQueue";
import { portfolioContactsAreFresh } from "./portfolioContacts";
const fresh = (overrides = {}) => ({ email: null, phone: null, address: null,
  contactCheckedAt: new Date().toISOString(), ...overrides });
const success = () => ({ ok: true, json: async () => ({ status: "updated", contacts: fresh({ email: "new@example.com" }) }) });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let queue, fetchContacts;
beforeEach(() => {
  vi.useFakeTimers();
  fetchContacts = vi.fn().mockImplementation(async () => success());
  queue = createPortfolioContactQueue({ viewerId: 2, workspaceId: 44, fetchContacts });
  queue.start();
});
afterEach(() => { queue.stop(); vi.useRealTimers(); });

describe("contact refresh queue", () => {
  it("reuses valid empty contacts and rejects future/incomplete freshness", async () => {
    expect(portfolioContactsAreFresh(fresh())).toBe(true);
    expect(portfolioContactsAreFresh(fresh({ email: undefined }))).toBe(false);
    expect(portfolioContactsAreFresh(fresh({ contactCheckedAt: new Date(Date.now() + 10000).toISOString() }))).toBe(false);
    queue.watch("100", fresh());
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchContacts).not.toHaveBeenCalled();
  });
  it("starts no work until a card requests contacts", async () => {
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchContacts).not.toHaveBeenCalled();
  });
  it("cancels a queued request when details close before the short delay", async () => {
    const unwatch = queue.watch("100", {});
    unwatch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContacts).not.toHaveBeenCalled();
  });
  it("deduplicates visible requests and serializes different records with pacing", async () => {
    const first = deferred();
    fetchContacts.mockReturnValueOnce(first.promise);
    queue.watch("100", {}); queue.watch("100", {}); queue.watch("101", {});
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchContacts).toHaveBeenCalledTimes(1);
    expect(fetchContacts.mock.calls[0][0]).toContain("/100/portfolio-contact?viewer_id=2&workspace_id=44");
    first.resolve(success());
    await vi.advanceTimersByTimeAsync(749);
    expect(fetchContacts).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchContacts).toHaveBeenCalledTimes(2);
  });
  it("reuses successful contact results after unmounting/remounting a card", async () => {
    const unwatch = queue.watch("100", {});
    await vi.advanceTimersByTimeAsync(1000);
    unwatch(); queue.watch("100", {});
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContacts).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().entries["100"].contacts.email).toBe("new@example.com");
  });
  it("does not request another record while the page is hidden", async () => {
    queue.setVisible(false); queue.watch("100", {});
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContacts).not.toHaveBeenCalled();
    queue.setVisible(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchContacts).toHaveBeenCalledTimes(1);
  });
  it("stops all automatic work on throttling until a user retries after the cooldown", async () => {
    fetchContacts.mockResolvedValueOnce({ ok: false, json: async () => ({ status: "paused", reason: "throttled",
      retryAt: new Date(Date.now() + 60000).toISOString() }) });
    queue.watch("100", {}); queue.watch("101", {});
    await vi.advanceTimersByTimeAsync(300);
    queue.retry("100");
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchContacts).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().pause.reason).toBe("throttled");
    queue.retry("100");
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchContacts).toHaveBeenCalledTimes(2);
  });
  it("preserves saved contacts from a failed response", async () => {
    const saved = fresh({ email: "saved@example.com", contactCheckedAt: "2020-01-01T00:00:00Z" });
    fetchContacts.mockResolvedValueOnce({ ok: false, json: async () => ({ status: "paused", contacts: saved }) });
    queue.watch("100", saved);
    await vi.advanceTimersByTimeAsync(1000);
    expect(queue.getSnapshot().entries["100"].contacts).toEqual(saved);
    expect(queue.getSnapshot().pause).toBeTruthy();
  });
  it("pauses rather than retrying a network error or malformed result", async () => {
    fetchContacts.mockRejectedValueOnce(new Error("network"));
    queue.watch("100", {}); queue.watch("101", {});
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchContacts).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().pause.reason).toBe("unavailable");
  });
  it("ignores late results from a disposed workspace and aborts its fetch", async () => {
    const first = deferred();
    fetchContacts.mockReturnValueOnce(first.promise);
    queue.watch("100", {});
    await vi.advanceTimersByTimeAsync(300);
    queue.stop();
    first.resolve(success());
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContacts.mock.calls[0][1].signal.aborted).toBe(true);
    expect(queue.getSnapshot().entries["100"].contacts).toBeUndefined();
  });
  it("can restart safely after Strict Mode's setup/cleanup cycle", async () => {
    queue.watch("100", {}); queue.stop(); queue.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContacts).toHaveBeenCalledTimes(1);
  });
});
